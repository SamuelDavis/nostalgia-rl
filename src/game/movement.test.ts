import { describe, expect, it } from "vitest";
import { Feature, Ground, MAX_CLIMB, Water } from "../worldgen";
import { Direction, blockerBetween, isSwimming, stepToward } from "./movement";

const land = (height: number) => ({ height, ground: Ground.Grass, water: Water.None, feature: Feature.None });
const path = (height: number) => ({ ...land(height), ground: Ground.Path });

describe("stepToward", () => {
  it("moves one tile in a cardinal direction, y growing southward", () => {
    expect(stepToward({ x: 3, y: 4 }, Direction.North)).toEqual({ x: 3, y: 3 });
    expect(stepToward({ x: 3, y: 4 }, Direction.East)).toEqual({ x: 4, y: 4 });
    expect(stepToward({ x: 3, y: 4 }, Direction.South)).toEqual({ x: 3, y: 5 });
    expect(stepToward({ x: 3, y: 4 }, Direction.West)).toEqual({ x: 2, y: 4 });
  });
});

describe("blockerBetween", () => {
  it("allows climbing or descending up to the climb limit", () => {
    expect(blockerBetween(land(100), land(100 + MAX_CLIMB))).toBeUndefined();
    expect(blockerBetween(land(100), land(100 - MAX_CLIMB))).toBeUndefined();
  });

  it("treats steeper steps either way as cliffs", () => {
    expect(blockerBetween(land(100), land(101 + MAX_CLIMB))).toBe("cliff");
    expect(blockerBetween(land(100), land(99 - MAX_CLIMB))).toBe("cliff");
  });

  it("climbs any step by stairs between two trail tiles", () => {
    expect(blockerBetween(path(100), path(116))).toBeUndefined();
    expect(blockerBetween(path(100), { ...land(116), ground: Ground.Road })).toBeUndefined();
    expect(blockerBetween(land(100), path(116))).toBe("cliff");
  });

  it("lets you swim in deep water", () => {
    expect(blockerBetween(land(64), { ...land(63), water: Water.Deep })).toBeUndefined();
  });

  it("is blocked by solid features", () => {
    for (const feature of [Feature.Oak, Feature.Pine, Feature.Cactus, Feature.Boulder, Feature.Tent, Feature.Campfire])
      expect(blockerBetween(land(100), { ...land(100), feature })).toBe("obstacle");
  });

  it("walks through low plants and over bridges", () => {
    for (const feature of [Feature.Bush, Feature.Flowers, Feature.Tuft])
      expect(blockerBetween(land(100), { ...land(100), feature })).toBeUndefined();
    const bridge = { height: 63, ground: Ground.Sand, water: Water.Deep, feature: Feature.Bridge };
    expect(blockerBetween({ ...land(64), ground: Ground.Road }, bridge)).toBeUndefined();
  });
});

describe("isSwimming", () => {
  it("is true in deep water off a bridge", () => {
    expect(isSwimming({ ...land(63), water: Water.Deep })).toBe(true);
    expect(isSwimming({ ...land(63), water: Water.Deep, feature: Feature.Bridge })).toBe(false);
    expect(isSwimming({ ...land(63), water: Water.Shallow })).toBe(false);
  });
});
