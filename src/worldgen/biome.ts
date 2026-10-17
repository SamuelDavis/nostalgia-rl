import { clamp, smoothstep } from "../lib";
import { Biome, Ground, Prop } from "./terrain";
import type { Conditions } from "./fields";
import { SEA_ELEVATION, SEA_LEVEL, heightLevel } from "./constants";

const BEACH_ELEVATION = SEA_ELEVATION + 0.0125;
const RUGGED_RANGE = [0.4, 0.9] as const;
const RUGGED_HEIGHT_RANGE = [100, 130] as const;
const ALTITUDE_RANGE = [135, 165] as const;
const MOUNTAIN_THRESHOLD = 0.5;
const SHORE_FADE = 0.005;
const TREELINE_MOUNTAINNESS = 0.25;
const FOREST_MOISTURE_RANGE = [0.36, 0.86] as const;
export const FOREST_THRESHOLD = 0.4;

export const MOUNTAIN_LEVEL = heightLevel(0.5);

export const mountainness = (ruggedness: number, level: number): number =>
  Math.max(
    smoothstep(...RUGGED_RANGE, ruggedness) * smoothstep(...RUGGED_HEIGHT_RANGE, level),
    smoothstep(...ALTITUDE_RANGE, level),
  );

export const forestness = (moisture: number, mountainness: number, elevation: number): number =>
  clamp((moisture - FOREST_MOISTURE_RANGE[0]) / (FOREST_MOISTURE_RANGE[1] - FOREST_MOISTURE_RANGE[0]), 0, 1) *
  (1 - smoothstep(TREELINE_MOUNTAINNESS, MOUNTAIN_THRESHOLD, mountainness)) *
  smoothstep(BEACH_ELEVATION, BEACH_ELEVATION + SHORE_FADE, elevation);

export const biomeOf = ({ elevation, temperature, moisture, mountainness, forestness }: Conditions): Biome => {
  const height = heightLevel(elevation);
  if (height < SEA_LEVEL) return Biome.Ocean;
  if (elevation < BEACH_ELEVATION) return Biome.Beach;
  if (mountainness >= MOUNTAIN_THRESHOLD) return Biome.Mountain;
  if (temperature > 0.6 && moisture < 0.42) return Biome.Desert;
  if (forestness >= FOREST_THRESHOLD) return Biome.Forest;
  return Biome.Grassland;
};

export interface BiomeTraits {
  readonly ground: (level: number, temperature: number) => Ground;
  readonly treeDensity: (grove: number) => number;
  readonly tree: (temperature: number) => Prop;
  readonly decoration: (roll: number) => Prop;
}

const SNOW_LEVEL = heightLevel(0.8125);
const COLD = 0.3;
const PINE_TEMPERATURE = 0.4;

const sand = () => Ground.Sand;
const grassUnlessFrozen = (_level: number, temperature: number) =>
  temperature < COLD - 0.08 ? Ground.Snow : Ground.Grass;
const pineIfCool = (temperature: number) => (temperature < PINE_TEMPERATURE ? Prop.Pine : Prop.Oak);
const bare = () => Prop.None;
const boulders = (roll: number) => (roll < 0.03 ? Prop.Boulder : Prop.None);
const flora = (roll: number) =>
  roll < 0.015 ? Prop.Bush : roll < 0.04 ? Prop.Flowers : roll < 0.12 ? Prop.Tuft : Prop.None;
const barren: BiomeTraits = { ground: sand, treeDensity: () => 0, tree: bare, decoration: bare };

export const BIOMES: Record<Biome, BiomeTraits> = {
  [Biome.Ocean]: barren,
  [Biome.Beach]: barren,
  [Biome.Grassland]: {
    ground: grassUnlessFrozen,
    treeDensity: (grove) => (grove > 0.45 ? 0.3 : 0.012),
    tree: pineIfCool,
    decoration: flora,
  },
  [Biome.Forest]: {
    ground: grassUnlessFrozen,
    treeDensity: (grove) => (grove < -0.35 ? 0.02 : 0.45),
    tree: pineIfCool,
    decoration: flora,
  },
  [Biome.Desert]: { ground: sand, treeDensity: () => 0.008, tree: () => Prop.Cactus, decoration: boulders },
  [Biome.Mountain]: {
    ground: (level, temperature) => (level >= SNOW_LEVEL || temperature < COLD ? Ground.Snow : Ground.Rock),
    treeDensity: () => 0.04,
    tree: () => Prop.Pine,
    decoration: boulders,
  },
};
