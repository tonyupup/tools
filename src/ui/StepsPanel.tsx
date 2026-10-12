import { useEffect, useState } from 'preact/hooks';
import { saveBlob } from '../engine/batch';
import { Macro, jump, recordMacro, redo, runMacroOnCurrent, saveMacros, undo, useStore } from '../store';

export function StepsPanel() {
  const history = useStore(s => s.history);
  const hIndex = useStore(s => s.hIndex);
  const macros = useStore(s => s.macros);
  const adv = useStore(s => s.advanced);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState('');

  useEffect(() => { // 新增的步骤默认计入宏
    setPicked(p => { const n = new Set([...p].filter(i => i < history.length)); if (hIndex > 0) n.add(hIndex); return n; });
  }, [history.length]);

  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const t = ev.target as HTMLElement;
      if (t.tagName === 'INPUT' && ['number', 'text'].includes((t as HTMLInputElement).type)) return;
      const k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); }
      else if ((k === 'z' && ev.shiftKey) || k === 'y') { ev.preventDefault(); redo(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  const save = () => {
    const idx = adv ? [...picked].filter(i => i <= hIndex) : Array.from({ length: hIndex }, (_, i) => i + 1);
    const m = recordMacro(name.trim(), idx);
    setMsg(m ? `已保存宏「${m.name}」（${m.steps.length} 步）` : '没有可保存的步骤，请先做一些编辑。');
    if (m) setName('');
  };
  const exportMacro = (m: Macro) => saveBlob(new Blob([JSON.stringify(m, null, 2)], { type: 'application/json' }), `${m.name}.macro.json`);
  const importMacro = async (f?: File) => {
    if (!f) return;
    try {
      const m = JSON.parse(await f.text()) as Macro;
      if (!Array.isArray(m.steps)) throw new Error();
      saveMacros([...macros, { ...m, id: Math.random().toString(36).slice(2, 9) }]);
      setMsg(`已导入宏「${m.name}」`);
    } catch { setMsg('导入失败：不是有效的宏文件。'); }
  };

  return (
    <div class="steps-panel">
      <div class="head">
        <h3>处理步骤</h3>
        <div class="btns">
          <button type="button" class="btn sm" disabled={hIndex <= 0} onClick={undo} title="撤销 (Ctrl+Z)">↶ 撤销</button>
          <button type="button" class="btn sm" disabled={hIndex >= history.length - 1} onClick={redo} title="重做 (Ctrl+Shift+Z)">↷ 重做</button>
        </div>
      </div>
      <ol class="steps">
        {history.map((h, i) => (
          <li key={i} class={i === hIndex ? 'cur' : i > hIndex ? 'future' : ''}>
            {adv && i > 0 && <input type="checkbox" aria-label="计入宏" checked={picked.has(i)} onChange={() => setPicked(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; })} />}
            <button type="button" onClick={() => jump(i)} aria-current={i === hIndex ? 'step' : undefined}><span class="no">{i}</span><span class="txt">{h.label}</span></button>
          </li>
        ))}
      </ol>
      <p class="muted">所有步骤都从原图重新计算，撤销 / 重做不会反复压缩；点击任意步骤可跳转。</p>

      <div class="head"><h3>宏</h3></div>
      <div class="row">
        <input type="text" id="macroName" placeholder="宏名称，例如：头像 512" value={name} onInput={ev => setName((ev.target as HTMLInputElement).value)} aria-label="宏名称" />
        <button type="button" class="btn" onClick={save}>保存</button>
      </div>
      <p class="muted">{adv ? '勾选要计入的步骤，' : ''}把当前步骤录制成可重复使用的“动作”，可在这里套用，也可在「批处理」里用。</p>
      {msg && <p class="note">{msg}</p>}
      <ul class="macros">
        {macros.length === 0 && <li class="empty">还没有宏</li>}
        {macros.map(m => (
          <li key={m.id}>
            <div class="mname"><strong>{m.name}</strong><span class="muted">{m.steps.length} 步</span></div>
            {adv && <div class="muted small">{m.steps.map(s => s.label).join(' → ')}</div>}
            <div class="row">
              <button type="button" class="btn sm" onClick={() => runMacroOnCurrent(m)}>套用到当前图</button>
              {adv && <button type="button" class="btn sm" onClick={() => exportMacro(m)}>导出</button>}
              <button type="button" class="btn sm" onClick={() => saveMacros(macros.filter(x => x.id !== m.id))}>删除</button>
            </div>
          </li>
        ))}
      </ul>
      {adv && <label class="btn sm file">导入宏文件<input type="file" accept="application/json,.json" hidden onChange={ev => importMacro((ev.target as HTMLInputElement).files?.[0])} /></label>}
    </div>
  );
}
