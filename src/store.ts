import { useEffect, useState } from 'preact/hooks';
import { adaptCrop, canvasToBlob, extOf, renderEdit, Source, transformedSize } from './engine/render';
import { cloneEdit, defaultEdit, Edit, Slot, SLOTS } from './engine/types';
import { describeChange } from './engine/labels';

export type Macro = { id: string; name: string; steps: { label: string; slots: Partial<Edit> }[] };
export type Meta = { name: string; bytes: number; w: number; h: number };
export type Preview = { url: string; bytes: number; w: number; h: number; ext: string } | null;
export type Store = {
  src: Source | null; meta: Meta | null;
  edit: Edit; history: { edit: Edit; label: string }[]; hIndex: number;
  preview: Preview; status: string;
  macros: Macro[]; advanced: boolean; view: 'edit' | 'batch';
};

const lsGet = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式等 */ } };

let state: Store = {
  src: null, meta: null, edit: defaultEdit(), history: [], hIndex: -1, preview: null, status: '',
  macros: lsGet<Macro[]>('imgws.macros', []), advanced: lsGet('imgws.advanced', false), view: 'edit',
};
const subs = new Set<() => void>();
export const getState = () => state;
export function set(p: Partial<Store>) { state = { ...state, ...p }; subs.forEach(f => f()); }
export function useStore<T>(sel: (s: Store) => T): T {
  const [v, setV] = useState(() => sel(state));
  useEffect(() => {
    const f = () => setV(() => sel(state));
    subs.add(f); f();
    return () => { subs.delete(f); };
  }, []);
  return v;
}

/* ---------- 历史：只保存参数快照，成品永远从原图重算 ---------- */
const MAX_HISTORY = 100;

/** 修改当前参数。live=true 时只更新预览，不进入历史（拖动滑块过程中用）。 */
export function edit(fn: (e: Edit) => void, live = false) {
  const e = cloneEdit(state.edit);
  fn(e);
  set({ edit: e });
  schedulePreview();
  if (!live) commit();
}

export function commit() {
  const { history, hIndex, edit: e } = state;
  if (hIndex < 0) return;
  const label = describeChange(history[hIndex].edit, e);
  if (!label) return;
  const h = history.slice(0, hIndex + 1);
  h.push({ edit: cloneEdit(e), label });
  if (h.length > MAX_HISTORY) h.shift();
  set({ history: h, hIndex: h.length - 1 });
}

export function jump(i: number, verb = '已跳转到') {
  commit();
  const { history } = state;
  if (i < 0 || i >= history.length || i === state.hIndex) return;
  set({ hIndex: i, edit: cloneEdit(history[i].edit), status: `${verb}：${history[i].label}。1 秒后基于原图重新生成预览…` });
  schedulePreview(false);
}
export const undo = () => { commit(); jump(state.hIndex - 1, '已撤销到'); };
export const redo = () => { commit(); jump(state.hIndex + 1, '已重做到'); };

/* ---------- 预览：参数变化后等 1 秒再刷新 ---------- */
let timer = 0, version = 0;
export function schedulePreview(announce = true) {
  if (!state.src) return;
  clearTimeout(timer);
  if (announce) set({ status: '参数已更改，1 秒后更新预览…' });
  timer = window.setTimeout(refreshPreview, 1000);
}
export async function refreshPreview() {
  clearTimeout(timer);
  const { src, edit: e, meta } = state;
  if (!src || !meta) return;
  const v = ++version;
  try {
    const canvas = renderEdit(src, e);
    const blob = await canvasToBlob(canvas, e.output);
    if (v !== version) return;
    if (state.preview) URL.revokeObjectURL(state.preview.url);
    set({
      preview: { url: URL.createObjectURL(blob), bytes: blob.size, w: canvas.width, h: canvas.height, ext: extOf(e.output.format) },
      status: `预览已更新：${canvas.width} × ${canvas.height}，${fmtBytes(blob.size)}（来自原图重新计算）`,
    });
  } catch (err) { if (v === version) set({ status: '处理失败：' + (err as Error).message }); }
}

let srcId = 0;
export async function loadFile(file: File) {
  if (!file.type.startsWith('image/')) { set({ status: '请选择有效的图片文件。' }); return; }
  try {
    const bitmap = await createImageBitmap(file);
    if (state.src) state.src.bitmap.close();
    if (state.preview) URL.revokeObjectURL(state.preview.url);
    const e = defaultEdit();
    e.resize.w = bitmap.width;
    set({
      src: { bitmap, id: ++srcId }, meta: { name: file.name, bytes: file.size, w: bitmap.width, h: bitmap.height },
      edit: e, history: [{ edit: cloneEdit(e), label: '载入原图' }], hIndex: 0, preview: null,
      status: `已载入：${file.name}`, view: 'edit',
    });
    schedulePreview(false);
  } catch { set({ status: '图片读取失败，请尝试其他格式或文件。' }); }
}
export function closeImage() {
  if (state.src) state.src.bitmap.close();
  if (state.preview) URL.revokeObjectURL(state.preview.url);
  clearTimeout(timer); version++;
  set({ src: null, meta: null, edit: defaultEdit(), history: [], hIndex: -1, preview: null, status: '' });
}

export const setAdvanced = (advanced: boolean) => { lsSet('imgws.advanced', advanced); set({ advanced }); };

/* ---------- 宏：录制已有步骤 ---------- */
export function recordMacro(name: string, indices: number[]): Macro | null {
  const { history } = state;
  const steps = indices.filter(i => i > 0 && i < history.length).sort((a, b) => a - b).map(i => {
    const prev = history[i - 1].edit, cur = history[i].edit, slots: Partial<Edit> = {};
    for (const s of SLOTS) if (JSON.stringify(prev[s]) !== JSON.stringify(cur[s])) (slots as any)[s] = cloneEdit(cur)[s];
    return { label: history[i].label, slots };
  });
  if (!steps.length) return null;
  const m: Macro = { id: Math.random().toString(36).slice(2, 9), name: name || `宏 ${state.macros.length + 1}`, steps };
  saveMacros([...state.macros, m]);
  return m;
}
export function saveMacros(macros: Macro[]) { lsSet('imgws.macros', macros); set({ macros }); }

/** 把宏的所有步骤按顺序套到 base 上；固定比例的裁剪会按目标图尺寸重新居中适配。 */
export function applyMacro(m: Macro, base: Edit, w: number, h: number): Edit {
  const e = cloneEdit(base);
  for (const st of m.steps) for (const s of Object.keys(st.slots) as Slot[]) (e as any)[s] = JSON.parse(JSON.stringify(st.slots[s]));
  const [tw, th] = transformedSize(w, h, e.transform);
  e.crop = adaptCrop(e.crop, tw, th);
  return e;
}
export function runMacroOnCurrent(m: Macro) {
  const { meta } = state; if (!meta) return;
  edit(e => { Object.assign(e, applyMacro(m, e, meta.w, meta.h)); });
}

export function fmtBytes(n: number) {
  return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
}
