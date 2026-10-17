import { Biome } from "./terrain";
import { describe, expect, it } from "vitest";
import { FOREST_THRESHOLD, biomeOf, forestness, mountainness } from "./biome";
import { SEA_ELEVATION } from "./constants";

describe("biomeOf", () => {
  it.each([
    [SEA_ELEVATION - 0.03, 0.5, 0.5, 1, 1, Biome.Ocean],
    [SEA_ELEVATION + 0.003, 0.5, 0.5, 1, 1, Biome.Beach],
    [SEA_ELEVATION + 0.056, 0.5, 0.45, 0, 0.2, Biome.Grassland],
    [0.47, 0.5, 0.45, 1, 1, Biome.Mountain],
    [0.47, 0.8, 0.2, 0, 0, Biome.Desert],
    [0.47, 0.5, 0.7, 0, 0.8, Biome.Forest],
    [0.47, 0.5, 0.45, 0, 0.2, Biome.Grassland],
  ])(
    "elevation %f, temperature %f, moisture %f, mountainness %f, forestness %f → %i",
    (elevation, temperature, moisture, mountain, forest, biome) => {
      expect(biomeOf({ elevation, temperature, moisture, mountainness: mountain, forestness: forest })).toBe(biome);
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

describe("forestness", () => {
  const inland = 0.4;

  it("rises with moisture from none on dry ground to full on the wettest", () => {
    expect(forestness(0.3, 0, inland)).toBe(0);
    expect(forestness(0.5, 0, inland)).toBeLessThan(forestness(0.6, 0, inland));
    expect(forestness(0.9, 0, inland)).toBe(1);
  });

  it("makes forest of ground as wet as forest has always needed", () => {
    expect(forestness(0.56, 0, inland)).toBeCloseTo(FOREST_THRESHOLD);
  });

  it("thins toward the mountains, gone where they begin", () => {
    expect(forestness(0.9, 0.4, inland)).toBeLessThan(forestness(0.9, 0, inland));
    expect(forestness(0.9, 0.5, inland)).toBe(0);
  });

  it("thins toward the shore, gone on the beach", () => {
    expect(forestness(0.9, 0, SEA_ELEVATION + 0.01)).toBe(0);
    expect(forestness(0.9, 0, SEA_ELEVATION + 0.015)).toBeGreaterThan(0);
    expect(forestness(0.9, 0, SEA_ELEVATION + 0.015)).toBeLessThan(1);
  });
});
