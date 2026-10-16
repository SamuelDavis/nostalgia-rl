import { type Field2, clamp, createNoise, fbm, hashString, smoothstep } from "../lib";

export interface Fields {
  readonly elevation: Field2;
  readonly drainage: Field2;
  readonly temperature: Field2;
  readonly moisture: Field2;
}

const layer = (seed: number, name: string, octaves: number, frequency: number): Field2 =>
  fbm(createNoise(seed, hashString(name)), { octaves, frequency });

const distanceFromOrigin = (x: number, y: number) => Math.sqrt(x * x + y * y);

export const createFields = (seed: number): Fields => {
  const continent = layer(seed, "continent", 5, 1 / 3600);
  const ridges = layer(seed, "ridges", 4, 1 / 700);
  const ranges = layer(seed, "ranges", 2, 1 / 2000);
  const hills = layer(seed, "hills", 3, 1 / 110);
  const heat = layer(seed, "temperature", 3, 1 / 3000);
  const wetness = layer(seed, "moisture", 4, 1 / 1500);

  const landness = (x: number, y: number) =>
    continent(x, y) + 0.4 * (1 - smoothstep(0, 1800, distanceFromOrigin(x, y)));

  const drainage: Field2 = (x, y) => {
    const land = landness(x, y);
    const ridge = smoothstep(0.6, 0.97, 1 - Math.abs(ridges(x, y)));
    const range = smoothstep(-0.15, 0.25, ranges(x, y));
    const mountains = smoothstep(0.08, 0.4, land) * range * ridge;
    return 0.3 + land * 0.3 + mountains * 0.55;
  };

  const elevation: Field2 = (x, y) => clamp(drainage(x, y) + hills(x, y) * 0.04, 0, 0.999);

  const temperature: Field2 = (x, y) => clamp(0.5 + heat(x, y) * 0.8 - Math.max(0, elevation(x, y) - 0.55) * 1.2, 0, 1);

  const moisture: Field2 = (x, y) => clamp(0.5 + wetness(x, y) * 0.8, 0, 1);

  return { elevation, drainage, temperature, moisture };
};
