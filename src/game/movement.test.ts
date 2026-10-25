import { describe, expect, it } from "vitest";
import { Prop, MAX_CLIMB, Water, Way } from "../worldgen";
import { GRASS } from "./terrain.fixtures";
import { Direction, blockerBetween, isStairway, isSwimming, stepToward } from "./movement";

const land = (height: number) => ({ height, way: Way.None, water: Water.None, prop: Prop.None });
const path = (height: number) => ({ ...land(height), way: Way.Path });

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
    expect(blockerBetween(path(100), { ...land(116), way: Way.Road })).toBeUndefined();
    expect(blockerBetween(land(100), path(116))).toBe("cliff");
  });

  it("lets you swim in deep water", () => {
    expect(blockerBetween(land(64), { ...land(63), water: Water.Deep })).toBeUndefined();
  });

  it("is blocked by solid props", () => {
    for (const prop of [Prop.Oak, Prop.Pine, Prop.Cactus, Prop.Boulder, Prop.Tent, Prop.Campfire])
      expect(blockerBetween(land(100), { ...land(100), prop })).toBe("obstacle");
  });

  it("walks through low plants and over bridges", () => {
    for (const prop of [Prop.Bush, Prop.Flowers, Prop.Tuft])
      expect(blockerBetween(land(100), { ...land(100), prop })).toBeUndefined();
    const bridge = { height: 63, way: Way.Road, water: Water.Deep, prop: Prop.Bridge };
    expect(blockerBetween({ ...land(64), way: Way.Road }, bridge)).toBeUndefined();
  });
});

describe("isSwimming", () => {
  it("is true in deep water off a bridge", () => {
    expect(isSwimming({ ...land(63), water: Water.Deep })).toBe(true);
    expect(isSwimming({ ...land(63), water: Water.Deep, prop: Prop.Bridge })).toBe(false);
    expect(isSwimming({ ...land(63), water: Water.Shallow })).toBe(false);
  });
});

describe("isStairway", () => {
  const ledgeEast = (x: number, y: number) => ({
    ...GRASS,
    height: x > 0 ? GRASS.height + MAX_CLIMB + 1 : GRASS.height,
    way: y === 0 ? Way.Path : Way.None,
  });

  it("is a trail tile with a step too high to climb onto another trail", () => {
    expect(isStairway(ledgeEast, 0, 0)).toBe(true);
    expect(isStairway(ledgeEast, 1, 0)).toBe(true);
    expect(isStairway(ledgeEast, 0, 1)).toBe(false);
    expect(isStairway(ledgeEast, -1, 0)).toBe(false);
  });
});
