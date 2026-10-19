export const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const floorDiv = (n: number, d: number): number => Math.floor(n / d);

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const inverseLerp = (a: number, b: number, v: number): number => (v - a) / (b - a);

export const remap = (v: number, from: readonly [number, number], to: readonly [number, number]): number =>
  lerp(to[0], to[1], inverseLerp(from[0], from[1], v));

export const smoothstep = (edge0: number, edge1: number, v: number): number => {
  const t = clamp(inverseLerp(edge0, edge1, v), 0, 1);
  return t * t * (3 - 2 * t);
};

export const powInt = (base: number, exponent: number): number => {
  let result = 1;
  for (let i = 0; i < exponent; i++) result *= base;
  return result;
};

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const QUARTER_PI = Math.PI / 4;

const sinNearZero = (x: number): number => {
  const x2 = x * x;
  return (
    x *
    (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800))))))
  );
};

export const sin = (x: number): number => {
  const r = x - Math.round(x / TAU) * TAU;
  if (r > HALF_PI) return sinNearZero(Math.PI - r);
  if (r < -HALF_PI) return sinNearZero(-Math.PI - r);
  return sinNearZero(r);
};

export const cos = (x: number): number => sin(x + HALF_PI);

const atanNearZero = (x: number): number => {
  const x2 = x * x;
  let sum = 0;
  for (let k = 12; k >= 0; k--) sum = (k % 2 === 0 ? 1 : -1) / (2 * k + 1) + x2 * sum;
  return x * sum;
};

const TAN_EIGHTH_PI = Math.SQRT2 - 1;

const atanUnit = (x: number): number =>
  x > TAN_EIGHTH_PI ? QUARTER_PI + atanNearZero((x - 1) / (x + 1)) : atanNearZero(x);

export const atan = (x: number): number => {
  if (x < 0) return -atan(-x);
  return x > 1 ? HALF_PI - atanUnit(1 / x) : atanUnit(x);
};

export const atan2 = (y: number, x: number): number => {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + Math.PI : atan(y / x) - Math.PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
};
