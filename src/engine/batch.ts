import JSZip from 'jszip';
import { adaptCrop, canvasToBlob, extOf, renderEdit, transformedSize } from './render';
import { cloneEdit, Edit } from './types';

export type BatchItem = {
  id: number; file: File; status: 'wait' | 'run' | 'done' | 'error';
  url?: string; blob?: Blob; name?: string; w?: number; h?: number; error?: string;
};

/** 在不同尺寸的图上复用同一份参数：固定比例的裁剪会按各自的尺寸重新居中适配。 */
export function editForImage(base: Edit, w: number, h: number): Edit {
  const e = cloneEdit(base);
  const [tw, th] = transformedSize(w, h, e.transform);
  e.crop = adaptCrop(e.crop, tw, th);
  return e;
}

export function outName(file: string, pattern: string, w: number, h: number, ext: string) {
  const base = file.replace(/\.[^.]+$/, '') || 'image';
  return pattern.replace(/\{name\}/g, base).replace(/\{w\}/g, String(w)).replace(/\{h\}/g, String(h)) + '.' + ext;
}

export async function processOne(item: BatchItem, makeEdit: (w: number, h: number) => Edit, pattern: string) {
  const bitmap = await createImageBitmap(item.file);
  try {
    const e = makeEdit(bitmap.width, bitmap.height);
    const canvas = renderEdit({ bitmap, id: -item.id }, e);
    const blob = await canvasToBlob(canvas, e.output);
    return { blob, w: canvas.width, h: canvas.height, name: outName(item.file.name, pattern, canvas.width, canvas.height, extOf(e.output.format)) };
  } finally { bitmap.close(); }
}

export async function zipItems(items: BatchItem[]): Promise<Blob> {
  const zip = new JSZip(), used = new Set<string>();
  for (const it of items) {
    if (!it.blob || !it.name) continue;
    let n = it.name, i = 1;
    while (used.has(n)) n = it.name.replace(/(\.[^.]+)$/, `_${i++}$1`);
    used.add(n); zip.file(n, it.blob);
  }
  return zip.generateAsync({ type: 'blob' });
}

export function saveBlob(blob: Blob | string, name: string) {
  const url = typeof blob === 'string' ? blob : URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  if (typeof blob !== 'string') setTimeout(() => URL.revokeObjectURL(url), 10000);
}
