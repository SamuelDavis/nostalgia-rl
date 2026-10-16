import { type Field2, clamp, createNoise, fbm, hashString, lerp, smoothstep } from "../lib";
import { HEIGHT_LEVELS } from "./constants";

export interface Climate {
  readonly elevation: number;
  readonly temperature: number;
  readonly moisture: number;
}

export interface Fields {
  readonly elevation: Field2;
  readonly elevationBeforeLedges: Field2;
  readonly drainage: Field2;
  readonly temperature: Field2;
  readonly moisture: Field2;
  readonly climate: (x: number, y: number) => Climate;
}

const layer = (seed: number, name: string, octaves: number, frequency: number): Field2 =>
  fbm(createNoise(seed, hashString(name)), { octaves, frequency });

const TERRACE_STEP = 16 / HEIGHT_LEVELS;

const distanceFromOrigin = (x: number, y: number) => Math.sqrt(x * x + y * y);

export const createFields = (seed: number): Fields => {
  const continent = layer(seed, "continent", 5, 1 / 3600);
  const ridges = layer(seed, "ridges", 4, 1 / 700);
  const ranges = layer(seed, "ranges", 2, 1 / 2000);
  const hills = layer(seed, "hills", 3, 1 / 110);
  const ledges = layer(seed, "ledges", 2, 1 / 150);
  const heat = layer(seed, "temperature", 3, 1 / 3000);
  const wetness = layer(seed, "moisture", 4, 1 / 1500);

  const landness = (x: number, y: number) =>
    continent(x, y) + 0.4 * (1 - smoothstep(0, 1800, distanceFromOrigin(x, y)));

  const relief = (x: number, y: number) => {
    const land = landness(x, y);
    const ridge = smoothstep(0.6, 0.97, 1 - Math.abs(ridges(x, y)));
    const range = smoothstep(-0.15, 0.25, ranges(x, y));
    const mountains = smoothstep(0.08, 0.4, land) * range * ridge;
    return { mountains, drainage: 0.3 + land * 0.3 + mountains * 0.55 };
  };

  const drainage: Field2 = (x, y) => relief(x, y).drainage;

  const smoothElevation = (x: number, y: number) => {
    const { mountains, drainage } = relief(x, y);
    return { mountains, smooth: drainage + hills(x, y) * 0.04 };
  };

  const elevation: Field2 = (x, y) => {
    const { mountains, smooth } = smoothElevation(x, y);
    const terracing = smoothstep(0.05, 0.3, mountains);
    const phase = ledges(x, y) * TERRACE_STEP;
    const terraced = Math.floor((smooth + phase) / TERRACE_STEP) * TERRACE_STEP - phase;
    return clamp(lerp(smooth, terraced, terracing), 0, 0.999);
  };

  const temperatureAt = (x: number, y: number, e: number) =>
    clamp(0.5 + heat(x, y) * 0.8 - Math.max(0, e - 0.55) * 1.2, 0, 1);

  const moisture: Field2 = (x, y) => clamp(0.5 + wetness(x, y) * 0.8, 0, 1);

  const climate = (x: number, y: number): Climate => {
    const e = elevation(x, y);
    return { elevation: e, temperature: temperatureAt(x, y, e), moisture: moisture(x, y) };
  };

  return {
    elevation,
    elevationBeforeLedges: (x, y) => clamp(smoothElevation(x, y).smooth, 0, 0.999),
    drainage,
    temperature: (x, y) => temperatureAt(x, y, elevation(x, y)),
    moisture,
    climate,
  };
};
