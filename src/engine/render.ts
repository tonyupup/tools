import { Crop, Edit, Rect, Resize, SHAPE_RATIO, Transform } from './types';

export type Source = { bitmap: ImageBitmap; id: number };

const MAX_SIDE = 20000;
let tcache: { key: string; canvas: HTMLCanvasElement } | null = null;

export function transformedSize(w: number, h: number, t: Transform): [number, number] {
  return t.rotate === 90 || t.rotate === 270 ? [h, w] : [w, h];
}

/** 旋转 / 翻转后的整图（带缓存，裁剪与调整变化时不会重复计算） */
export function getTransformed(src: Source, t: Transform): HTMLCanvasElement {
  const key = `${src.id}|${t.rotate}|${t.flipH}|${t.flipV}`;
  if (tcache?.key === key) return tcache.canvas;
  const { width: w, height: h } = src.bitmap;
  const [tw, th] = transformedSize(w, h, t);
  const c = document.createElement('canvas');
  c.width = tw; c.height = th;
  const ctx = c.getContext('2d')!;
  ctx.translate(tw / 2, th / 2);
  ctx.rotate((t.rotate * Math.PI) / 180);
  ctx.scale(t.flipH ? -1 : 1, t.flipV ? -1 : 1);
  ctx.drawImage(src.bitmap, -w / 2, -h / 2);
  tcache = { key, canvas: c };
  return c;
}

/** 在 W×H 的图内，取指定像素比例下尽可能大的选区；若给出 around，则以其中心和宽度为基准。 */
export function fitRect(ratio: number, W: number, H: number, around?: Rect): Rect {
  let wPx = around ? Math.min(around.w * W, H * ratio) : Math.min(W, H * ratio);
  if (!around) wPx = Math.min(W, H * ratio);
  let hPx = wPx / ratio;
  if (hPx > H) { hPx = H; wPx = hPx * ratio; }
  if (wPx > W) { wPx = W; hPx = wPx / ratio; }
  const cx = around ? (around.x + around.w / 2) * W : W / 2;
  const cy = around ? (around.y + around.h / 2) * H : H / 2;
  const x = Math.max(0, Math.min(cx - wPx / 2, W - wPx));
  const y = Math.max(0, Math.min(cy - hPx / 2, H - hPx));
  return { x: x / W, y: y / H, w: wPx / W, h: hPx / H };
}

/** 宏 / 批处理套用到不同尺寸的图时，固定比例的选区重新按比例居中适配。 */
export function adaptCrop(crop: Crop, W: number, H: number): Crop {
  const r = SHAPE_RATIO[crop.shape](crop);
  if (!r) return crop;
  return { ...crop, rect: fitRect(r, W, H, crop.rect) };
}

export function cropPixels(W: number, H: number, crop: Crop) {
  if (!crop.enabled) return { sx: 0, sy: 0, sw: W, sh: H };
  const { x, y, w, h } = crop.rect;
  return { sx: x * W, sy: y * H, sw: Math.max(1, w * W), sh: Math.max(1, h * H) };
}

export function outputSize(cw: number, ch: number, r: Resize, crop: Crop): [number, number] {
  const clamp = (v: number) => Math.max(1, Math.min(MAX_SIDE, Math.round(v)));
  const aspect = cw / ch;
  switch (r.mode) {
    case 'size': return r.lock ? [clamp(r.w), clamp(r.w / aspect)] : [clamp(r.w), clamp(r.h)];
    case 'maxEdge': { const k = r.maxEdge / Math.max(cw, ch); return [clamp(cw * k), clamp(ch * k)]; }
    case 'percent': return [clamp((cw * r.percent) / 100), clamp((ch * r.percent) / 100)];
    default: return [clamp(cw), clamp(ch)];
  }
}

export function filterString(a: Edit['adjust']) {
  const parts: string[] = [];
  if (a.brightness !== 100) parts.push(`brightness(${a.brightness}%)`);
  if (a.contrast !== 100) parts.push(`contrast(${a.contrast}%)`);
  if (a.saturation !== 100) parts.push(`saturate(${a.saturation}%)`);
  if (a.hue) parts.push(`hue-rotate(${a.hue}deg)`);
  if (a.grayscale) parts.push(`grayscale(${a.grayscale}%)`);
  if (a.sepia) parts.push(`sepia(${a.sepia}%)`);
  if (a.blur) parts.push(`blur(${a.blur}px)`);
  return parts.join(' ') || 'none';
}

function sharpen(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h), s = img.data, o = new Uint8ClampedArray(s);
  const k = amount / 100;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      const lap = 4 * s[i + c] - s[i - 4 + c] - s[i + 4 + c] - s[i - w * 4 + c] - s[i + w * 4 + c];
      o[i + c] = s[i + c] + lap * k;
    }
  }
  img.data.set(o);
  ctx.putImageData(img, 0, 0);
}

/** 从原图按参数完整重算一遍，返回成品画布。 */
export function renderEdit(src: Source, e: Edit): HTMLCanvasElement {
  const T = getTransformed(src, e.transform);
  const { sx, sy, sw, sh } = cropPixels(T.width, T.height, e.crop);
  const [w, h] = outputSize(sw, sh, e.resize, e.crop);
  const circle = e.crop.enabled && e.crop.shape === 'circle';

  const base = document.createElement('canvas');
  base.width = w; base.height = h;
  const b = base.getContext('2d')!;
  b.imageSmoothingQuality = 'high';
  const draw = (dx: number, dy: number, dw: number, dh: number) => b.drawImage(T, sx, sy, sw, sh, dx, dy, dw, dh);
  const fit = e.resize.mode === 'size' && !e.resize.lock ? e.resize.fit : 'stretch';
  if (fit === 'contain' || fit === 'blur') {
    b.fillStyle = e.resize.bg; b.fillRect(0, 0, w, h);
    if (fit === 'blur') {
      const blur = Math.max(12, Math.min(40, Math.round(Math.min(w, h) * 0.025)));
      const m = blur * 3, k = Math.max((w + 2 * m) / sw, (h + 2 * m) / sh);
      b.save(); b.filter = `blur(${blur}px)`; draw((w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k); b.restore();
    }
    const k = Math.min(w / sw, h / sh);
    draw((w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
  } else if (fit === 'cover') {
    const k = Math.max(w / sw, h / sh), cw = w / k, ch = h / k;
    b.drawImage(T, sx + (sw - cw) / 2, sy + (sh - ch) / 2, cw, ch, 0, 0, w, h);
  } else draw(0, 0, w, h);

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d')!;
  o.filter = filterString(e.adjust);
  o.drawImage(base, 0, 0);
  o.filter = 'none';
  if (e.adjust.sharpen > 0) sharpen(o, w, h, e.adjust.sharpen);
  if (circle) { // 椭圆遮罩：圆外透明
    o.globalCompositeOperation = 'destination-in';
    o.beginPath(); o.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); o.fill();
    o.globalCompositeOperation = 'source-over';
  }
  if (e.output.format === 'image/jpeg') { // JPG 无透明通道，用背景色垫底
    const f = document.createElement('canvas');
    f.width = w; f.height = h;
    const fc = f.getContext('2d')!;
    fc.fillStyle = circle ? e.resize.bg : '#ffffff'; fc.fillRect(0, 0, w, h); fc.drawImage(out, 0, 0);
    return f;
  }
  return out;
}

export function canvasToBlob(c: HTMLCanvasElement, out: Edit['output']): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob(b => (b ? res(b) : rej(new Error('浏览器无法生成该格式'))), out.format, out.format === 'image/png' ? undefined : out.quality / 100));
}

export const extOf = (f: Edit['output']['format']) => (f === 'image/jpeg' ? 'jpg' : f === 'image/png' ? 'png' : 'webp');
