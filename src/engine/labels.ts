import { Edit } from './types';

const MODE = { original: '保持原尺寸', size: '指定尺寸', maxEdge: '限制长边', percent: '按比例缩放' } as const;
const FIT = { contain: '保持比例留边', blur: '模糊背景填充', cover: '居中裁剪铺满', stretch: '拉伸' } as const;
const FMT = { 'image/webp': 'WebP', 'image/jpeg': 'JPG', 'image/png': 'PNG' } as const;
export const SHAPE_NAME = { free: '自由', ratio: '固定比例', avatar: '人像头像', circle: '圆形头像', half: '半身照' } as const;
const ADJ: Record<string, string> = { brightness: '亮度', contrast: '对比度', saturation: '饱和度', hue: '色相', blur: '模糊', sharpen: '锐化', grayscale: '黑白', sepia: '复古' };

const r = (v: number) => Math.round(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 比较两份参数，生成"这一步做了什么"。没有变化返回空串。 */
export function describeChange(a: Edit, b: Edit): string {
  const out: string[] = [];
  if (!same(a.transform, b.transform)) {
    const t = b.transform, p: string[] = [];
    if (t.rotate !== a.transform.rotate) p.push(`旋转 ${t.rotate}°`);
    if (t.flipH !== a.transform.flipH) p.push('水平翻转');
    if (t.flipV !== a.transform.flipV) p.push('垂直翻转');
    out.push(p.join('，') || '变换');
  }
  if (!same(a.crop, b.crop)) {
    const c = b.crop, o = a.crop;
    if (o.enabled !== c.enabled) out.push(c.enabled ? '启用裁剪' : '关闭裁剪');
    if (o.shape !== c.shape || (c.shape === 'ratio' && o.ratio !== c.ratio))
      out.push(`选取形状：${SHAPE_NAME[c.shape]}${c.shape === 'ratio' ? ` ${+c.ratio.toFixed(3)}:1` : ''}`);
    else if (o.enabled === c.enabled && !same(o.rect, c.rect))
      out.push(`裁剪 ${r(c.rect.w * 100)}% × ${r(c.rect.h * 100)}% @ (${r(c.rect.x * 100)}%, ${r(c.rect.y * 100)}%)`);
  }
  if (!same(a.adjust, b.adjust)) {
    for (const k of Object.keys(b.adjust) as (keyof Edit['adjust'])[])
      if (a.adjust[k] !== b.adjust[k]) out.push(`${ADJ[k]} ${a.adjust[k]} → ${b.adjust[k]}`);
  }
  if (!same(a.resize, b.resize)) {
    const x = a.resize, y = b.resize;
    if (x.mode !== y.mode) out.push(`分辨率：${MODE[y.mode]}`);
    if (y.mode === 'size' && (x.w !== y.w || x.h !== y.h)) out.push(`目标尺寸 ${y.w}${y.lock ? '' : '×' + y.h}`);
    if (x.maxEdge !== y.maxEdge && y.mode === 'maxEdge') out.push(`长边 ${y.maxEdge}px`);
    if (x.percent !== y.percent && y.mode === 'percent') out.push(`缩放 ${y.percent}%`);
    if (x.lock !== y.lock) out.push(y.lock ? '锁定宽高比' : '解除宽高比锁定');
    if (x.fit !== y.fit) out.push(`适配方式：${FIT[y.fit]}`);
    if (x.bg !== y.bg) out.push(`背景色 ${y.bg}`);
  }
  if (!same(a.output, b.output)) {
    if (a.output.format !== b.output.format) out.push(`格式转换：${FMT[a.output.format]} → ${FMT[b.output.format]}`);
    if (a.output.quality !== b.output.quality) out.push(`压缩质量 ${a.output.quality}% → ${b.output.quality}%`);
  }
  return out.join('；');
}
