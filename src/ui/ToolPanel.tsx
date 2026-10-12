import { cropPixels, fitRect, getTransformed, outputSize, transformedSize } from '../engine/render';
import { CropShape, defaultEdit, Edit, SHAPE_RATIO } from '../engine/types';
import { commit, edit, fmtBytes, getState, refreshPreview, useStore } from '../store';
import { saveBlob } from '../engine/batch';
import { Chips, Section, Slider } from './widgets';

const SHAPES: { v: string; label: string; shape: CropShape; ratio?: number; size?: number }[] = [
  { v: 'free', label: '自由', shape: 'free' },
  { v: '1', label: '1:1', shape: 'ratio', ratio: 1 },
  { v: '4:3', label: '4:3', shape: 'ratio', ratio: 4 / 3 },
  { v: '3:2', label: '3:2', shape: 'ratio', ratio: 3 / 2 },
  { v: '16:9', label: '16:9', shape: 'ratio', ratio: 16 / 9 },
  { v: '3:4', label: '3:4', shape: 'ratio', ratio: 3 / 4 },
  { v: '2:3', label: '2:3', shape: 'ratio', ratio: 2 / 3 },
  { v: '9:16', label: '9:16', shape: 'ratio', ratio: 9 / 16 },
  { v: 'avatar', label: '人像头像', shape: 'avatar', size: 512 },
  { v: 'circle', label: '圆形头像', shape: 'circle', size: 512 },
  { v: 'half', label: '半身照', shape: 'half', size: 900 },
];
const currentShape = (shape: CropShape, ratio: number) =>
  shape === 'ratio' ? (SHAPES.find(s => s.shape === 'ratio' && Math.abs((s.ratio ?? 0) - ratio) < 1e-3)?.v ?? 'custom') : shape === 'free' ? 'free' : shape;

const FILTERS: { label: string; v: Partial<ReturnType<typeof defaultEdit>['adjust']> }[] = [
  { label: '原图', v: {} },
  { label: '鲜艳', v: { saturation: 135, contrast: 110 } },
  { label: '柔和', v: { saturation: 90, contrast: 92, brightness: 105 } },
  { label: '黑白', v: { grayscale: 100, contrast: 110 } },
  { label: '复古', v: { sepia: 60, contrast: 95, saturation: 90 } },
];

/** 旋转后整图尺寸变了，选区回到整张图（固定比例则取该比例下的最大范围） */
function rotateBy(x: Edit, deg: number) {
  const { src } = getState(); if (!src) return;
  x.transform.rotate = ((x.transform.rotate + deg) % 360) as Edit['transform']['rotate'];
  const [tw, th] = transformedSize(src.bitmap.width, src.bitmap.height, x.transform);
  const r = SHAPE_RATIO[x.crop.shape](x.crop);
  x.crop.rect = r ? fitRect(r, tw, th) : { x: 0, y: 0, w: 1, h: 1 };
}

function pickShape(key: string) {
  const s = SHAPES.find(x => x.v === key)!;
  const { src, edit: cur } = getState(); if (!src) return;
  edit(e => {
    e.crop.enabled = true; e.crop.shape = s.shape;
    const T = getTransformed(src, e.transform);
    if (s.ratio) e.crop.ratio = s.ratio;
    const r = SHAPE_RATIO[s.shape](e.crop);
    e.crop.rect = r ? fitRect(r, T.width, T.height, s.size ? undefined : cur.crop.rect) : e.crop.rect;
    if (s.size) { // 头像 / 半身照：给一个常用输出尺寸，但不超过选区实际像素
      const { sw } = cropPixels(T.width, T.height, e.crop);
      e.resize.mode = 'size'; e.resize.lock = true; e.resize.w = Math.max(1, Math.min(s.size, Math.round(sw)));
    }
  });
}

export function ToolPanel() {
  const e = useStore(s => s.edit);
  const adv = useStore(s => s.advanced);
  const meta = useStore(s => s.meta);
  const src = useStore(s => s.src);
  if (!meta || !src) return null;
  const T = getTransformed(src, e.transform);
  const { sw, sh } = cropPixels(T.width, T.height, e.crop);
  const [ow, oh] = outputSize(sw, sh, e.resize, e.crop);
  const done = commit;
  const set = (fn: (x: typeof e) => void) => edit(fn);
  const live = (fn: (x: typeof e) => void) => edit(fn, true);
  const shapeKey = currentShape(e.crop.shape, e.crop.ratio);
  const a = e.adjust;
  const adj = (k: keyof typeof a, label: string, min: number, max: number, unit = '') =>
    <Slider label={label} value={a[k]} min={min} max={max} unit={unit} onLive={v => live(x => { x.adjust[k] = v; })} onDone={done} />;

  const download = async () => {
    await refreshPreview();
    const p = getState().preview; if (!p) return;
    saveBlob(p.url, `${meta.name.replace(/\.[^.]+$/, '') || 'image'}_${p.w}x${p.h}.${p.ext}`);
  };

  return (
    <div class="tools">
      <Section title="变换">
        <div class="row">
          <button type="button" class="btn" onClick={() => set(x => { rotateBy(x, 270); })}>↺ 左转 90°</button>
          <button type="button" class="btn" onClick={() => set(x => { rotateBy(x, 90); })}>↻ 右转 90°</button>
        </div>
        <div class="row">
          <button type="button" class="btn" onClick={() => set(x => { x.transform.flipH = !x.transform.flipH; })}>⇋ 水平翻转</button>
          <button type="button" class="btn" onClick={() => set(x => { x.transform.flipV = !x.transform.flipV; })}>⇅ 垂直翻转</button>
        </div>
        <p class="muted">旋转后选区会重新适配整张图。</p>
      </Section>

      <Section title="裁剪与形状">
        <label class="inline"><input type="checkbox" checked={e.crop.enabled} onChange={ev => {
          const on = (ev.target as HTMLInputElement).checked; set(x => { x.crop.enabled = on; });
        }} /> 启用裁剪</label>
        <Chips value={shapeKey} options={SHAPES.map(s => ({ v: s.v, label: s.label }))} onPick={pickShape} />
        <div class="row">
          <button type="button" class="btn" onClick={() => set(x => {
            const r = SHAPE_RATIO[x.crop.shape](x.crop);
            x.crop.rect = r ? fitRect(r, T.width, T.height) : { x: 0, y: 0, w: 1, h: 1 };
          })}>重置选区</button>
          <button type="button" class="btn" onClick={() => set(x => {
            const q = x.crop.rect; x.crop.rect = { ...q, x: (1 - q.w) / 2, y: (1 - q.h) / 2 };
          })}>居中选区</button>
        </div>
        {adv && (
          <div class="field">
            <label>自定义比例（宽 : 高）</label>
            <div class="row">
              <input type="number" min="1" max="100" value={+(e.crop.ratio >= 1 ? e.crop.ratio : 1).toFixed(2)} id="rw"
                onChange={() => applyCustom()} aria-label="比例宽" />
              <input type="number" min="1" max="100" value={+(e.crop.ratio >= 1 ? 1 : 1 / e.crop.ratio).toFixed(2)} id="rh"
                onChange={() => applyCustom()} aria-label="比例高" />
            </div>
          </div>
        )}
        <p class="muted">选区 {Math.round(sw)} × {Math.round(sh)} px · 拖动框移动，拖四角缩放。</p>
      </Section>

      <Section title="调整">
        <Chips value="" options={FILTERS.map(f => ({ v: f.label, label: f.label }))} onPick={name => {
          const f = FILTERS.find(x => x.label === name)!;
          set(x => { x.adjust = { ...defaultEdit().adjust, ...f.v }; });
        }} />
        {adj('brightness', '亮度', 30, 180, '%')}
        {adj('contrast', '对比度', 30, 180, '%')}
        {adj('saturation', '饱和度', 0, 200, '%')}
        {adv && <>
          {adj('hue', '色相', -180, 180, '°')}
          {adj('blur', '模糊', 0, 20, 'px')}
          {adj('sharpen', '锐化', 0, 100, '%')}
          {adj('grayscale', '黑白', 0, 100, '%')}
          {adj('sepia', '复古', 0, 100, '%')}
        </>}
        <p class="muted">双击滑块可恢复默认值。</p>
      </Section>

      <Section title="尺寸与分辨率">
        <div class="field">
          <label for="rmode">缩放方式</label>
          <select id="rmode" value={e.resize.mode} onChange={ev => set(x => {
            x.resize.mode = (ev.target as HTMLSelectElement).value as typeof x.resize.mode;
            if (x.resize.mode === 'size') x.resize.w = Math.round(sw);
          })}>
            <option value="original">保持原尺寸</option>
            <option value="size">指定宽高</option>
            <option value="maxEdge">限制长边</option>
            <option value="percent">按百分比</option>
          </select>
        </div>
        {e.resize.mode === 'size' && <>
          <div class="row">
            <div class="grow"><label for="rw2">宽</label><input id="rw2" type="number" min="1" max="20000" value={e.resize.w}
              onInput={ev => live(x => { x.resize.w = Number((ev.target as HTMLInputElement).value); if (x.resize.lock) x.resize.h = Math.round(x.resize.w * sh / sw); })} onChange={done} /></div>
            <div class="grow"><label for="rh2">高</label><input id="rh2" type="number" min="1" max="20000" value={e.resize.lock ? oh : e.resize.h} disabled={e.resize.lock}
              onInput={ev => live(x => { x.resize.h = Number((ev.target as HTMLInputElement).value); })} onChange={done} /></div>
          </div>
          <label class="inline"><input type="checkbox" checked={e.resize.lock} onChange={ev => {
            const on = (ev.target as HTMLInputElement).checked; set(x => { x.resize.lock = on; if (!on) { x.resize.h = oh; x.resize.w = ow; } });
          }} /> 锁定宽高比（按选区比例）</label>
          {adv && !e.resize.lock && <>
            <div class="field"><label for="fit">宽高比不一致时</label>
              <select id="fit" value={e.resize.fit} onChange={ev => set(x => { x.resize.fit = (ev.target as HTMLSelectElement).value as typeof x.resize.fit; })}>
                <option value="contain">保持比例（留边）</option>
                <option value="blur">模糊背景填充</option>
                <option value="cover">居中裁剪铺满</option>
                <option value="stretch">拉伸变形</option>
              </select></div>
          </>}
        </>}
        {e.resize.mode === 'maxEdge' && <div class="field"><label for="me">长边不超过（px）</label>
          <input id="me" type="number" min="1" max="20000" value={e.resize.maxEdge} onInput={ev => live(x => { x.resize.maxEdge = Number((ev.target as HTMLInputElement).value); })} onChange={done} /></div>}
        {e.resize.mode === 'percent' && <Slider label="缩放" value={e.resize.percent} min={5} max={300} unit="%" onLive={v => live(x => { x.resize.percent = v; })} onDone={done} />}
        {adv && <div class="field"><label for="bg">留边 / 圆形 JPG 背景色</label>
          <input id="bg" type="color" value={e.resize.bg} onInput={ev => live(x => { x.resize.bg = (ev.target as HTMLInputElement).value; })} onChange={done} /></div>}
        <p class="muted">输出：<strong>{ow} × {oh}</strong> px（原图 {meta.w} × {meta.h}）</p>
      </Section>

      <Section title="导出">
        <div class="field"><label for="fmt">格式</label>
          <select id="fmt" value={e.output.format} onChange={ev => set(x => { x.output.format = (ev.target as HTMLSelectElement).value as typeof x.output.format; })}>
            <option value="image/webp">WebP（体积小）</option>
            <option value="image/jpeg">JPG</option>
            <option value="image/png">PNG（无损、可透明）</option>
          </select></div>
        {e.output.format !== 'image/png' && <Slider label="压缩质量" value={e.output.quality} min={10} max={100} unit="%" onLive={v => live(x => { x.output.quality = v; })} onDone={done} />}
        {e.crop.enabled && e.crop.shape === 'circle' && e.output.format === 'image/jpeg' && <p class="warn">圆形头像用 JPG 时四角会填充背景色，建议改用 PNG / WebP 保留透明。</p>}
        <button type="button" class="btn primary" onClick={download}>下载图片</button>
        <p class="muted">原图 {fmtBytes(meta.bytes)}</p>
      </Section>
    </div>
  );

  function applyCustom() {
    const w = Number((document.getElementById('rw') as HTMLInputElement).value), h = Number((document.getElementById('rh') as HTMLInputElement).value);
    if (!(w > 0 && h > 0)) return;
    edit(x => {
      x.crop.enabled = true; x.crop.shape = 'ratio'; x.crop.ratio = w / h;
      x.crop.rect = fitRect(w / h, T.width, T.height, x.crop.rect);
    });
  }
}
