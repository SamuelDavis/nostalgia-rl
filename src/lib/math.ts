export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const floorDiv = (n: number, d: number): number => Math.floor(n / d);

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const inverseLerp = (a: number, b: number, v: number): number => (v - a) / (b - a);

export const smoothstep = (edge0: number, edge1: number, v: number): number => {
  const t = clamp(inverseLerp(edge0, edge1, v), 0, 1);
  return t * t * (3 - 2 * t);
};

export const terrace = (v: number, step: number, riser: number): number => {
  const k = Math.floor(v / step);
  return (k + smoothstep(1 - riser, 1, v / step - k)) * step;
};
