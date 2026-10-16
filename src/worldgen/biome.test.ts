import { Biome } from "./terrain";
import { describe, expect, it } from "vitest";
import { classifyBiome } from "./biome";
import { SEA_ELEVATION } from "./constants";

describe("classifyBiome", () => {
  it.each([
    [SEA_ELEVATION - 0.03, 0.5, 0.5, Biome.Ocean],
    [SEA_ELEVATION + 0.003, 0.5, 0.5, Biome.Beach],
    [SEA_ELEVATION + 0.056, 0.5, 0.45, Biome.Grassland],
    [0.78, 0.5, 0.5, Biome.Mountain],
    [0.47, 0.8, 0.2, Biome.Desert],
    [0.47, 0.5, 0.7, Biome.Forest],
    [0.47, 0.5, 0.45, Biome.Grassland],
  ])("elevation %f, temperature %f, moisture %f → %i", (elevation, temperature, moisture, biome) => {
    expect(classifyBiome(elevation, temperature, moisture)).toBe(biome);
  });
});
