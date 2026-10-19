import { type Vec2 } from "./geometry";
import { hash3, hash4, unit } from "./hash";
import { powInt } from "./math";

export type Field<P extends readonly number[] = [x: number, y: number]> = (...p: P) => number;
export type Field2 = Field<[x: number, y: number]>;
export type Field3 = Field<[x: number, y: number, z: number]>;

const GRADIENT_VECTORS: readonly (readonly [number, number, number])[] = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

const GX = GRADIENT_VECTORS.map(([x]) => x);
const GY = GRADIENT_VECTORS.map(([, y]) => y);
const GZ = GRADIENT_VECTORS.map(([, , z]) => z);
const GRADIENTS = GRADIENT_VECTORS.length;

const SQRT3 = Math.sqrt(3);
const F2 = 0.5 * (SQRT3 - 1);
const G2 = (3 - SQRT3) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;
const SIMPLEX2_SCALE = 70;
const SIMPLEX3_SCALE = 32;

export const simplex2 = (seed: number): Field2 => {
  const corner = (i: number, j: number, dx: number, dy: number): number => {
    const t = 0.5 - dx * dx - dy * dy;
    if (t < 0) return 0;
    const g = hash3(seed, i, j) % GRADIENTS;
    const t2 = t * t;
    return t2 * t2 * (GX[g]! * dx + GY[g]! * dy);
  };
  return (x, y) => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    return (
      SIMPLEX2_SCALE *
      (corner(i, j, x0, y0) +
        corner(i + i1, j + j1, x0 - i1 + G2, y0 - j1 + G2) +
        corner(i + 1, j + 1, x0 - 1 + 2 * G2, y0 - 1 + 2 * G2))
    );
  };
};

const simplex3Offsets = (
  x: number,
  y: number,
  z: number,
): readonly [number, number, number, number, number, number] => {
  if (x >= y) {
    if (y >= z) return [1, 0, 0, 1, 1, 0];
    if (x >= z) return [1, 0, 0, 1, 0, 1];
    return [0, 0, 1, 1, 0, 1];
  }
  if (y < z) return [0, 0, 1, 0, 1, 1];
  if (x < z) return [0, 1, 0, 0, 1, 1];
  return [0, 1, 0, 1, 1, 0];
};

export const simplex3 = (seed: number): Field3 => {
  const corner = (i: number, j: number, k: number, dx: number, dy: number, dz: number): number => {
    const t = 0.6 - dx * dx - dy * dy - dz * dz;
    if (t < 0) return 0;
    const g = hash4(seed, i, j, k) % GRADIENTS;
    const t2 = t * t;
    return t2 * t2 * (GX[g]! * dx + GY[g]! * dy + GZ[g]! * dz);
  };
  return (x, y, z) => {
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const z0 = z - (k - t);
    const [i1, j1, k1, i2, j2, k2] = simplex3Offsets(x0, y0, z0);
    return (
      SIMPLEX3_SCALE *
      (corner(i, j, k, x0, y0, z0) +
        corner(i + i1, j + j1, k + k1, x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3) +
        corner(i + i2, j + j2, k + k2, x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3) +
        corner(i + 1, j + 1, k + 1, x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3))
    );
  };
};

export interface VoronoiSample {
  readonly id: number;
  readonly site: Vec2;
  readonly nearest: number;
  readonly second: number;
}

export const voronoi2 = (seed: number, jitter = 1): ((x: number, y: number) => VoronoiSample) => {
  const siteOf = (i: number, j: number): Vec2 => ({
    x: i + 0.5 + (unit(hash4(seed, i, j, 0)) - 0.5) * jitter,
    y: j + 0.5 + (unit(hash4(seed, i, j, 1)) - 0.5) * jitter,
  });
  return (x, y) => {
    const [ci, cj] = [Math.floor(x), Math.floor(y)];
    let best = { id: 0, site: { x, y }, nearest: Infinity, second: Infinity };
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        const site = siteOf(i, j);
        const d = Math.sqrt((site.x - x) * (site.x - x) + (site.y - y) * (site.y - y));
        if (d < best.nearest) best = { id: hash3(seed, i, j), site, nearest: d, second: best.nearest };
        else if (d < best.second) best = { ...best, second: d };
      }
    return best;
  };
};

export interface OctaveOptions {
  readonly octaves: number;
  readonly frequency?: number;
  readonly lacunarity?: number;
  readonly gain?: number;
}

const OCTAVE_OFFSET = 101.3;

const sampleAt = <P extends readonly number[]>(noise: Field<P>, p: P, f: number, offset: number): number => {
  if (p.length === 2) return (noise as unknown as Field2)(p[0]! * f + offset, p[1]! * f - offset);
  if (p.length === 3) return (noise as unknown as Field3)(p[0]! * f + offset, p[1]! * f - offset, p[2]! * f + offset);
  return noise(...(p.map((c, axis) => c * f + (axis % 2 === 0 ? offset : -offset)) as unknown as P));
};

const octaveSum = <P extends readonly number[]>(
  noise: Field<P>,
  { octaves, frequency = 1, lacunarity = 2, gain = 0.5 }: OctaveOptions,
  shape: (n: number) => number,
): Field<P> => {
  let total = 0;
  for (let i = 0; i < octaves; i++) total += powInt(gain, i);
  return (...p) => {
    let sum = 0;
    let amplitude = 1;
    let f = frequency;
    for (let i = 0; i < octaves; i++) {
      const offset = i * OCTAVE_OFFSET;
      sum += amplitude * shape(sampleAt(noise, p, f, offset));
      amplitude *= gain;
      f *= lacunarity;
    }
    return sum / total;
  };
};

export const fbm = <P extends readonly number[]>(noise: Field<P>, options: OctaveOptions): Field<P> =>
  octaveSum(noise, options, (n) => n);

export const ridged = <P extends readonly number[]>(noise: Field<P>, options: OctaveOptions): Field<P> =>
  octaveSum(noise, options, (n) => 1 - 2 * Math.abs(n));

export const warp =
  <P extends readonly number[]>(
    field: Field<P>,
    offsets: { readonly [A in keyof P]: Field<P> },
    amount: number,
  ): Field<P> =>
  (...p) =>
    field(...(p.map((c, axis) => c + amount * (offsets[axis] as Field<P>)(...p)) as unknown as P));
