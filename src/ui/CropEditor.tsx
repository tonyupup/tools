import { useEffect, useRef, useState } from 'preact/hooks';
import { getTransformed } from '../engine/render';
import { Rect, SHAPE_RATIO } from '../engine/types';
import { commit, edit, useStore } from '../store';

const MIN_PX = 16;
type Drag = { type: 'move' | 'resize'; handle: string; sx: number; sy: number; orig: Rect };

export function CropEditor() {
  const src = useStore(s => s.src);
  const e = useStore(s => s.edit);
  const stage = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [guide, setGuide] = useState(true);

  useEffect(() => {
    const el = stage.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const T = src ? getTransformed(src, e.transform) : null;
  const W = T?.width ?? 1, H = T?.height ?? 1;
  const scale = Math.min(box.w / W, box.h / H) || 1;
  const dw = W * scale, dh = H * scale, ox = (box.w - dw) / 2, oy = (box.h - dh) / 2;

  useEffect(() => { // 编辑器里只画缩小后的原图，裁剪外观不依赖成品
    if (!T || !view.current) return;
    const c = view.current, k = Math.min(1, 1400 / Math.max(W, H));
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const ctx = c.getContext('2d')!; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(T, 0, 0, c.width, c.height);
  }, [src?.id, e.transform.rotate, e.transform.flipH, e.transform.flipV]);

  if (!src) return null;
  const crop = e.crop, ratio = SHAPE_RATIO[crop.shape](crop);
  const r = crop.rect;
  const fx = ox + r.x * dw, fy = oy + r.y * dh, fw = r.w * dw, fh = r.h * dh;

  const down = (ev: PointerEvent, type: Drag['type'], handle = '') => {
    ev.preventDefault(); ev.stopPropagation();
    drag.current = { type, handle, sx: ev.clientX, sy: ev.clientY, orig: { ...crop.rect } };
    stage.current!.setPointerCapture(ev.pointerId);
  };
  const move = (ev: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const o = d.orig, dx = (ev.clientX - d.sx) / dw, dy = (ev.clientY - d.sy) / dh;
    let n: Rect;
    if (d.type === 'move') {
      n = { ...o, x: Math.max(0, Math.min(o.x + dx, 1 - o.w)), y: Math.max(0, Math.min(o.y + dy, 1 - o.h)) };
    } else {
      const east = d.handle.includes('e'), south = d.handle.includes('s');
      const minW = Math.min(MIN_PX / W, 1), minH = Math.min(MIN_PX / H, 1);
      if (!ratio) { // 自由比例：四角独立缩放
        const x1 = east ? o.x : Math.max(0, Math.min(o.x + dx, o.x + o.w - minW));
        const x2 = east ? Math.min(1, Math.max(o.x + o.w + dx, o.x + minW)) : o.x + o.w;
        const y1 = south ? o.y : Math.max(0, Math.min(o.y + dy, o.y + o.h - minH));
        const y2 = south ? Math.min(1, Math.max(o.y + o.h + dy, o.y + minH)) : o.y + o.h;
        n = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      } else { // 固定像素比例：以对角为锚点等比缩放
        const k = H * ratio / W; // 归一化坐标下 w = h * (H/W) * ratio
        let w = o.w + (east ? dx : -dx);
        const wFromY = (o.h + (south ? dy : -dy)) * k;
        if (Math.abs(dy * k) > Math.abs(dx)) w = wFromY;
        const maxW = Math.min(east ? 1 - o.x : o.x + o.w, (south ? 1 - o.y : o.y + o.h) * k);
        w = Math.min(Math.max(w, Math.min(minW, maxW)), maxW);
        const h = w / k;
        n = { x: east ? o.x : o.x + o.w - w, y: south ? o.y : o.y + o.h - h, w, h };
      }
    }
    edit(x => { x.crop.rect = n; }, true);
  };
  const up = () => { if (drag.current) { drag.current = null; commit(); } };

  const circle = crop.shape === 'circle';
  const guideKind = crop.shape === 'half' ? 'half' : crop.shape === 'avatar' || circle ? 'face' : null;
  return (
    <div class="editor">
      <div class="stage" ref={stage} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <canvas ref={view} class="stage-img" style={{ left: ox + 'px', top: oy + 'px', width: dw + 'px', height: dh + 'px' }} />
        {crop.enabled && (
          <div class={'frame' + (circle ? ' circle' : '')} style={{ left: fx + 'px', top: fy + 'px', width: fw + 'px', height: fh + 'px' }}
            onPointerDown={ev => down(ev, 'move')}>
            {guide && guideKind && (
              <svg class="guide" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {guideKind === 'face'
                  ? <g><ellipse cx="50" cy="44" rx="21" ry="27" /><path d="M8 100C10 80 30 74 50 74S90 80 92 100" /></g>
                  : <g><ellipse cx="50" cy="30" rx="14" ry="14" /><path d="M6 100C8 70 28 58 50 58S92 70 94 100" /></g>}
              </svg>
            )}
            {['nw', 'ne', 'sw', 'se'].map(h => <i key={h} class={'handle ' + h} onPointerDown={ev => down(ev, 'resize', h)} />)}
          </div>
        )}
        {!crop.enabled && <div class="stage-hint">裁剪已关闭 · 在左侧「裁剪与形状」启用后可框选</div>}
      </div>
      {crop.enabled && guideKind && (
        <label class="inline"><input type="checkbox" checked={guide} onChange={ev => setGuide((ev.target as HTMLInputElement).checked)} /> 构图参考线</label>
      )}
    </div>
  );
}

