const lowbias32 = (x: number): number => {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};

const GOLDEN = 0x9e3779b9;

export const hash = (...keys: readonly number[]): number =>
  keys.reduce((h, key) => lowbias32((h ^ (key | 0)) + GOLDEN), lowbias32(keys.length));

export const hashString = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return lowbias32(h);
};

export const unit = (h: number): number => h / 2 ** 32;

export const intBetween = (min: number, max: number, h: number): number => min + Math.floor(unit(h) * (max - min + 1));

export const pick = <T>(items: readonly T[], h: number): T => items[Math.floor(unit(h) * items.length)]!;
