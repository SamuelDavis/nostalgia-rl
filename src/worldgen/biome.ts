import { smoothstep } from "../lib";
import { Biome } from "./terrain";
import type { Climate } from "./fields";
import { SEA_ELEVATION, SEA_LEVEL, heightLevel } from "./constants";

const BEACH_ELEVATION = SEA_ELEVATION + 0.0125;
const RUGGED_RANGE = [0.4, 0.9] as const;
const RUGGED_HEIGHT_RANGE = [100, 130] as const;
const ALTITUDE_RANGE = [135, 165] as const;
const MOUNTAIN_THRESHOLD = 0.5;

export const MOUNTAIN_LEVEL = heightLevel(0.5);

export const mountainness = (ruggedness: number, level: number): number =>
  Math.max(
    smoothstep(...RUGGED_RANGE, ruggedness) * smoothstep(...RUGGED_HEIGHT_RANGE, level),
    smoothstep(...ALTITUDE_RANGE, level),
  );

export const biomeOf = ({ elevation, temperature, moisture, mountainness }: Climate): Biome => {
  const height = heightLevel(elevation);
  if (height < SEA_LEVEL) return Biome.Ocean;
  if (elevation < BEACH_ELEVATION) return Biome.Beach;
  if (mountainness >= MOUNTAIN_THRESHOLD) return Biome.Mountain;
  if (temperature > 0.6 && moisture < 0.42) return Biome.Desert;
  if (moisture > 0.56) return Biome.Forest;
  return Biome.Grassland;
};
