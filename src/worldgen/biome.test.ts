import { Biome } from "./terrain";
import { describe, expect, it } from "vitest";
import { classifyBiome } from "./biome";
import { HEIGHT_LEVELS, SEA_LEVEL } from "./constants";

describe("classifyBiome", () => {
  it.each([
    [(SEA_LEVEL - 0.5) / HEIGHT_LEVELS, 0.5, 0.5, Biome.Ocean],
    [(SEA_LEVEL + 0.05) / HEIGHT_LEVELS, 0.5, 0.5, Biome.Beach],
    [(SEA_LEVEL + 0.9) / HEIGHT_LEVELS, 0.5, 0.45, Biome.Grassland],
    [12.5 / HEIGHT_LEVELS, 0.5, 0.5, Biome.Mountain],
    [7.5 / HEIGHT_LEVELS, 0.8, 0.2, Biome.Desert],
    [7.5 / HEIGHT_LEVELS, 0.5, 0.7, Biome.Forest],
    [7.5 / HEIGHT_LEVELS, 0.5, 0.45, Biome.Grassland],
  ])("elevation %f, temperature %f, moisture %f → %i", (elevation, temperature, moisture, biome) => {
    expect(classifyBiome(elevation, temperature, moisture)).toBe(biome);
  });
});
