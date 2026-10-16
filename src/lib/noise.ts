import { createNoise2D } from "simplex-noise";
import { hash, unit } from "./hash";

export type Field2 = (x: number, y: number) => number;

export const createNoise = (seed: number, salt: number): Field2 => {
  let draw = 0;
  return createNoise2D(() => unit(hash(seed, salt, draw++)));
};

const OCTAVE_OFFSET = 101.3;

export interface FbmOptions {
  readonly octaves: number;
  readonly frequency?: number;
  readonly lacunarity?: number;
  readonly gain?: number;
}

const exactPower = (base: number, exponent: number): number =>
  Array.from({ length: exponent }).reduce<number>((p) => p * base, 1);

export const fbm = (noise: Field2, { octaves, frequency = 1, lacunarity = 2, gain = 0.5 }: FbmOptions): Field2 => {
  const octaveIndices = Array.from({ length: octaves }, (_, i) => i);
  const total = octaveIndices.reduce((sum, i) => sum + exactPower(gain, i), 0);
  return (x, y) => {
    let sum = 0;
    let amplitude = 1;
    let f = frequency;
    for (const i of octaveIndices) {
      sum += amplitude * noise(x * f + i * OCTAVE_OFFSET, y * f - i * OCTAVE_OFFSET);
      amplitude *= gain;
      f *= lacunarity;
    }
    return sum / total;
  };
};
