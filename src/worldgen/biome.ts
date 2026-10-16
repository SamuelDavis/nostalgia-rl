import { Biome } from "./terrain";
import { HEIGHT_LEVELS, SEA_LEVEL, heightLevel } from "./constants";

const BEACH_ELEVATION = (SEA_LEVEL + 0.2) / HEIGHT_LEVELS;

const MOUNTAIN_LEVEL = 11;

export const classifyBiome = (elevation: number, temperature: number, moisture: number): Biome => {
  const height = heightLevel(elevation);
  if (height < SEA_LEVEL) return Biome.Ocean;
  if (elevation < BEACH_ELEVATION) return Biome.Beach;
  if (height >= MOUNTAIN_LEVEL) return Biome.Mountain;
  if (temperature > 0.6 && moisture < 0.42) return Biome.Desert;
  if (moisture > 0.56) return Biome.Forest;
  return Biome.Grassland;
};
