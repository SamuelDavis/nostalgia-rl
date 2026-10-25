import { describe, expect, it } from "vitest";
import { Cover, Way } from "../worldgen";
import { interiorOf, isForestGate } from "./cover";
import type { Terrain } from "./terrain";
import { GRASS } from "./terrain.fixtures";

const twoRoofs: Terrain = (x, y) =>
  (x >= 0 && x <= 2) || (x >= 4 && x <= 6) ? { ...GRASS, cover: y === 0 ? Cover.Thatch : Cover.None } : GRASS;
const forestEast: Terrain = (x, y) => ({
  ...GRASS,
  way: y === 0 ? Way.Path : Way.None,
  cover: x > 0 ? Cover.Canopy : Cover.None,
});

describe("interiorOf", () => {
  it("reveals nothing to a player outside", () => {
    const interior = interiorOf(twoRoofs, { x: 3, y: 0 });
    expect(interior.contains(1, 0, twoRoofs(1, 0))).toBe(false);
  });

  it("reveals the roof the player stands under, not a neighbour's", () => {
    const interior = interiorOf(twoRoofs, { x: 1, y: 0 });
    expect(interior.contains(0, 0, twoRoofs(0, 0))).toBe(true);
    expect(interior.contains(2, 0, twoRoofs(2, 0))).toBe(true);
    expect(interior.contains(5, 0, twoRoofs(5, 0))).toBe(false);
  });

  it("reveals all canopy to a player under canopy", () => {
    const interior = interiorOf(forestEast, { x: 5, y: 3 });
    expect(interior.contains(500, 9, forestEast(500, 9))).toBe(true);
    expect(interior.contains(-5, 9, forestEast(-5, 9))).toBe(false);
  });

  it("names each interior apart, and the same interior alike from anywhere in it", () => {
    const keyAt = (x: number) => interiorOf(twoRoofs, { x, y: 0 }).key;
    expect(keyAt(0)).toBe(keyAt(2));
    expect(keyAt(0)).not.toBe(keyAt(5));
    expect(keyAt(3)).not.toBe(keyAt(0));
  });
});

describe("isForestGate", () => {
  it("is the open end of a trail entering canopy", () => {
    expect(isForestGate(forestEast, 0, 0)).toBe(true);
    expect(isForestGate(forestEast, -1, 0)).toBe(false);
    expect(isForestGate(forestEast, 1, 0)).toBe(false);
    expect(isForestGate(forestEast, 0, 1)).toBe(false);
  });
});
