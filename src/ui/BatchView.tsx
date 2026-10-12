import { useRef, useState } from 'preact/hooks';
import { BatchItem, editForImage, processOne, saveBlob, zipItems } from '../engine/batch';
import { cloneEdit, defaultEdit, Edit } from '../engine/types';
import { applyMacro, fmtBytes, getState, useStore } from '../store';

let nextId = 1;

export function BatchView() {
  const macros = useStore(s => s.macros);
  const hasImg = useStore(s => !!s.src);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [source, setSource] = useState('current');
  const [format, setFormat] = useState('keep');
  const [pattern, setPattern] = useState('{name}_{w}x{h}');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const add = (files: FileList | File[]) => {
    const list = [...files].filter(f => f.type.startsWith('image/')).map(file => ({ id: nextId++, file, status: 'wait' as const }));
    setItems(p => [...p, ...list]);
  };
  const update = (id: number, patch: Partial<BatchItem>) => setItems(p => p.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const makeEdit = (w: number, h: number): Edit => {
    let e: Edit;
    if (source === 'current') e = cloneEdit(getState().edit);
    else {
      const m = getState().macros.find(x => x.id === source)!;
      e = applyMacro(m, defaultEdit(), w, h);
    }
    if (format !== 'keep') e.output.format = format as Edit['output']['format'];
    return editForImage(e, w, h);
  };

  const run = async () => {
    if (!items.length || busy) return;
    setBusy(true); setMsg('');
    let ok = 0;
    for (const it of items) {
      update(it.id, { status: 'run', error: undefined });
      try {
        const r = await processOne(it, makeEdit, pattern);
        if (it.url) URL.revokeObjectURL(it.url);
        update(it.id, { status: 'done', blob: r.blob, name: r.name, w: r.w, h: r.h, url: URL.createObjectURL(r.blob) }); ok++;
      } catch (err) { update(it.id, { status: 'error', error: (err as Error).message }); }
      await new Promise(r => setTimeout(r)); // 让出主线程，进度可以刷新
    }
    setBusy(false); setMsg(`完成 ${ok} / ${items.length} 张。`);
  };
  const done = items.filter(i => i.status === 'done');

  return (
    <div class="batch">
      <div class="drop" tabIndex={0} role="button" onClick={() => input.current?.click()}
        onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (e.dataTransfer) add(e.dataTransfer.files); }}>
        <strong>拖入多张图片，或点击选择</strong><span class="muted">全部在浏览器本地处理，不上传服务器</span>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { add((e.target as HTMLInputElement).files!); (e.target as HTMLInputElement).value = ''; }} />
      </div>

      <div class="batch-opts">
        <div class="field"><label for="bsrc">套用的操作</label>
          <select id="bsrc" value={source} onChange={e => setSource((e.target as HTMLSelectElement).value)}>
            <option value="current">{hasImg ? '当前编辑里的全部参数' : '默认参数（尚未载入图片）'}</option>
            {macros.map(m => <option key={m.id} value={m.id}>宏：{m.name}（{m.steps.length} 步）</option>)}
          </select></div>
        <div class="field"><label for="bfmt">输出格式</label>
          <select id="bfmt" value={format} onChange={e => setFormat((e.target as HTMLSelectElement).value)}>
            <option value="keep">沿用操作里的设置</option><option value="image/webp">WebP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option>
          </select></div>
        <div class="field"><label for="bpat">文件名（{'{name}'} {'{w}'} {'{h}'}）</label>
          <input id="bpat" type="text" value={pattern} onInput={e => setPattern((e.target as HTMLInputElement).value)} /></div>
      </div>
      <p class="muted">固定比例的裁剪会在每张图上自动居中适配；自由比例的选区按相对位置套用。</p>

      <div class="row">
        <button type="button" class="btn primary" disabled={!items.length || busy} onClick={run}>{busy ? '处理中…' : `开始处理（${items.length} 张）`}</button>
        <button type="button" class="btn" disabled={!done.length} onClick={async () => saveBlob(await zipItems(done), 'images.zip')}>打包下载 zip（{done.length}）</button>
        <button type="button" class="btn" disabled={busy || !items.length} onClick={() => { items.forEach(i => i.url && URL.revokeObjectURL(i.url)); setItems([]); setMsg(''); }}>清空</button>
      </div>
      {msg && <p class="note">{msg}</p>}

      <ul class="files">
        {items.map(it => (
          <li key={it.id} class={it.status}>
            {it.url ? <img src={it.url} alt="" /> : <div class="ph" />}
            <div class="fi">
              <strong>{it.file.name}</strong>
              <span class="muted">{fmtBytes(it.file.size)}
                {it.status === 'done' && ` → ${it.w}×${it.h} · ${fmtBytes(it.blob!.size)}`}
                {it.status === 'run' && ' · 处理中…'}{it.status === 'error' && ` · 失败：${it.error}`}</span>
            </div>
            {it.status === 'done' && <button type="button" class="btn sm" onClick={() => saveBlob(it.blob!, it.name!)}>下载</button>}
            {!busy && <button type="button" class="btn sm" aria-label="移除" onClick={() => { if (it.url) URL.revokeObjectURL(it.url); setItems(p => p.filter(x => x.id !== it.id)); }}>×</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
