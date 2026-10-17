import { type Field2, clamp, createNoise, fbm, hashString, lerp, smoothstep } from "../lib";
import { HEIGHT_LEVELS, SEA_ELEVATION } from "./constants";
import { type Landform, jaggedness, peaksAndValleys, ruggedness, terrainOffset } from "./landform";

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
  readonly landform: (x: number, y: number) => Landform;
}

const layer = (seed: number, name: string, octaves: number, frequency: number): Field2 =>
  fbm(createNoise(seed, hashString(name)), { octaves, frequency });

const TERRACE_STEP = 16 / HEIGHT_LEVELS;
const ELEVATION_PER_OFFSET = 128 / HEIGHT_LEVELS;
const NOISE_STRETCH = 1.7;
const JAGGED_AMPLITUDE = 0.15;
const HILLS_AMPLITUDE = 0.02;
const ORIGIN_LAND_BIAS = 0.5;
const ORIGIN_LAND_RADIUS = 1800;

const distanceFromOrigin = (x: number, y: number) => Math.sqrt(x * x + y * y);

const stretched =
  (field: Field2): Field2 =>
  (x, y) =>
    clamp(field(x, y) * NOISE_STRETCH, -1, 1);

const halfNegative = (v: number) => (v < 0 ? v / 2 : v);

export const createFields = (seed: number): Fields => {
  const continents = stretched(layer(seed, "continentalness", 6, 1 / 3000));
  const erosionNoise = stretched(layer(seed, "erosion", 5, 1 / 2000));
  const ridges = stretched(layer(seed, "ridges", 3, 1 / 600));
  const jagged = layer(seed, "jagged", 3, 1 / 80);
  const hills = layer(seed, "hills", 3, 1 / 110);
  const ledges = layer(seed, "ledges", 2, 1 / 150);
  const heat = layer(seed, "temperature", 3, 1 / 3000);
  const wetness = layer(seed, "moisture", 4, 1 / 1500);

  const landform = (x: number, y: number): Landform => ({
    continentalness: Math.min(
      1,
      continents(x, y) + ORIGIN_LAND_BIAS * (1 - smoothstep(0, ORIGIN_LAND_RADIUS, distanceFromOrigin(x, y))),
    ),
    erosion: erosionNoise(x, y),
    peaksAndValleys: peaksAndValleys(ridges(x, y)),
  });

  const relief = (x: number, y: number) => {
    const form = landform(x, y);
    return { form, drainage: SEA_ELEVATION + terrainOffset(form) * ELEVATION_PER_OFFSET };
  };

  const drainage: Field2 = (x, y) => clamp(relief(x, y).drainage, 0, 0.999);

  const smoothElevation = (x: number, y: number) => {
    const { form, drainage } = relief(x, y);
    const peaks = jaggedness(form) * halfNegative(jagged(x, y)) * JAGGED_AMPLITUDE * ELEVATION_PER_OFFSET * 2;
    return { form, smooth: drainage + peaks + hills(x, y) * HILLS_AMPLITUDE };
  };

  const elevation: Field2 = (x, y) => {
    const { form, smooth } = smoothElevation(x, y);
    const phase = ledges(x, y) * TERRACE_STEP;
    const terraced = Math.floor((smooth + phase) / TERRACE_STEP) * TERRACE_STEP - phase;
    return clamp(lerp(smooth, terraced, ruggedness(form)), 0, 0.999);
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
    landform,
  };
};
