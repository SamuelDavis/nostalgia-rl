import { Biome } from "./terrain";
import { describe, expect, it } from "vitest";
import { biomeOf, mountainness } from "./biome";
import { SEA_ELEVATION } from "./constants";

describe("biomeOf", () => {
  it.each([
    [SEA_ELEVATION - 0.03, 0.5, 0.5, 1, Biome.Ocean],
    [SEA_ELEVATION + 0.003, 0.5, 0.5, 1, Biome.Beach],
    [SEA_ELEVATION + 0.056, 0.5, 0.45, 0, Biome.Grassland],
    [0.47, 0.5, 0.45, 1, Biome.Mountain],
    [0.47, 0.8, 0.2, 0, Biome.Desert],
    [0.47, 0.5, 0.7, 0, Biome.Forest],
    [0.47, 0.5, 0.45, 0, Biome.Grassland],
  ])(
    "elevation %f, temperature %f, moisture %f, mountainness %f → %i",
    (elevation, temperature, moisture, mountain, biome) => {
      expect(biomeOf({ elevation, temperature, moisture, mountainness: mountain })).toBe(biome);
    },
  );
});

describe("mountainness", () => {
  const isMountain = (rugged: number, level: number) => mountainness(rugged, level) >= 0.5;

  it("keeps a valley in rugged country mountainous", () => {
    expect(isMountain(1, 126)).toBe(true);
  });

  it("leaves rugged ground near sea level and smooth hills as they are", () => {
    expect(isMountain(1, 85)).toBe(false);
    expect(isMountain(0.2, 128)).toBe(false);
  });

  it("makes any high enough ground mountainous", () => {
    expect(isMountain(0, 165)).toBe(true);
  });

  it("changes gradually with height rather than at one level", () => {
    expect(mountainness(1, 115)).toBeGreaterThan(0);
    expect(mountainness(1, 115)).toBeLessThan(1);
  });
});
