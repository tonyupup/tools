export type Rect = { x: number; y: number; w: number; h: number }; // 0-1，相对旋转/翻转后的整张图

export type Transform = { rotate: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean };
export type CropShape = 'free' | 'ratio' | 'avatar' | 'circle' | 'half';
export type Crop = { enabled: boolean; shape: CropShape; ratio: number; rect: Rect };
export type Adjust = {
  brightness: number; contrast: number; saturation: number; // 100 为原样
  hue: number; blur: number; sharpen: number; grayscale: number; sepia: number;
};
export type FitMode = 'contain' | 'blur' | 'cover' | 'stretch';
export type ResizeMode = 'original' | 'size' | 'maxEdge' | 'percent';
export type Resize = {
  mode: ResizeMode; w: number; h: number; lock: boolean; maxEdge: number; percent: number;
  fit: FitMode; bg: string;
};
export type Output = { format: 'image/webp' | 'image/jpeg' | 'image/png'; quality: number };

/** 一次编辑的全部参数。所有处理都从原图按这份参数重新计算，不会累积压缩。 */
export type Edit = { transform: Transform; crop: Crop; adjust: Adjust; resize: Resize; output: Output };
export type Slot = keyof Edit;
export const SLOTS: Slot[] = ['transform', 'crop', 'adjust', 'resize', 'output'];

export const defaultEdit = (): Edit => ({
  transform: { rotate: 0, flipH: false, flipV: false },
  crop: { enabled: false, shape: 'free', ratio: 1, rect: { x: 0, y: 0, w: 1, h: 1 } },
  adjust: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sharpen: 0, grayscale: 0, sepia: 0 },
  resize: { mode: 'original', w: 1920, h: 1080, lock: true, maxEdge: 1920, percent: 100, fit: 'contain', bg: '#ffffff' },
  output: { format: 'image/webp', quality: 85 },
});

export const cloneEdit = (e: Edit): Edit => JSON.parse(JSON.stringify(e));

export const SHAPE_RATIO: Record<CropShape, (c: Crop) => number | null> = {
  free: () => null,
  ratio: c => c.ratio,
  avatar: () => 1,
  circle: () => 1,
  half: () => 3 / 4,
};
