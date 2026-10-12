import { useState } from 'preact/hooks';
import { fmtBytes, closeImage, loadFile, refreshPreview, set, setAdvanced, useStore } from '../store';
import { BatchView } from './BatchView';
import { CropEditor } from './CropEditor';
import { StepsPanel } from './StepsPanel';
import { ToolPanel } from './ToolPanel';

function Picker() {
  const [drag, setDrag] = useState(false);
  let el: HTMLInputElement | null = null;
  return (
    <div class={'drop big' + (drag ? ' drag' : '')} tabIndex={0} role="button" onClick={() => el?.click()}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && el?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer?.files[0]; if (f) loadFile(f); }}>
      <strong>拖拽图片到这里，或点击选择文件</strong>
      <span class="muted">JPG、PNG、WebP、GIF（取首帧）、BMP 等 · 全部在浏览器本地处理</span>
      <span class="muted">需要一次处理很多张？切换到上方「批处理」</span>
      <input ref={n => (el = n)} type="file" accept="image/*" hidden onChange={e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) loadFile(f); (e.target as HTMLInputElement).value = ''; }} />
    </div>
  );
}

function PreviewCard() {
  const p = useStore(s => s.preview);
  const meta = useStore(s => s.meta)!;
  return (
    <div class="preview-card">
      <div class="head"><h3>处理结果预览</h3><span class="muted">{p ? p.ext.toUpperCase() : '生成中…'}</span></div>
      <div class="preview">{p ? <img src={p.url} alt="处理结果预览" /> : <span class="muted">稍候，正在生成预览…</span>}</div>
      <div class="stats">
        <div><span>原图</span><strong>{meta.w} × {meta.h} · {fmtBytes(meta.bytes)}</strong></div>
        <div><span>输出</span><strong>{p ? `${p.w} × ${p.h} · ${fmtBytes(p.bytes)}` : '—'}</strong></div>
      </div>
      <button type="button" class="btn sm" onClick={refreshPreview}>立即刷新预览</button>
    </div>
  );
}

export function App() {
  const view = useStore(s => s.view);
  const adv = useStore(s => s.advanced);
  const has = useStore(s => !!s.src);
  const meta = useStore(s => s.meta);
  const status = useStore(s => s.status);
  return (
    <div class="app">
      <header class="top">
        <div class="brand"><h1>图片工坊</h1><span class="muted">裁剪 · 调整 · 批处理 · 宏</span></div>
        <nav class="tabs" aria-label="视图">
          <button type="button" class={view === 'edit' ? 'on' : ''} onClick={() => set({ view: 'edit' })}>编辑</button>
          <button type="button" class={view === 'batch' ? 'on' : ''} onClick={() => set({ view: 'batch' })}>批处理</button>
        </nav>
        <label class="switch"><input type="checkbox" checked={adv} onChange={e => setAdvanced((e.target as HTMLInputElement).checked)} /> 高级选项</label>
      </header>
      {view === 'batch' ? <BatchView /> : !has ? <Picker /> : (
        <div class="workspace">
          <aside class="col-tools"><ToolPanel /></aside>
          <main class="col-main">
            <div class="file-bar"><strong>{meta!.name}</strong><button type="button" class="btn sm" onClick={closeImage}>换一张图</button></div>
            <CropEditor />
            <PreviewCard />
          </main>
          <aside class="col-steps"><StepsPanel /></aside>
        </div>
      )}
      <div class="status" role="status">{status}</div>
    </div>
  );
}
