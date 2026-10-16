import { describe, expect, it } from "vitest";
import { MAX_CLIMB, Water } from "../worldgen";
import { Direction, blockerBetween, stepToward } from "./movement";

const land = (height: number) => ({ height, water: Water.None });

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

  it("lets you wade shallow water but not deep water", () => {
    expect(blockerBetween(land(64), { height: 63, water: Water.Shallow })).toBeUndefined();
    expect(blockerBetween(land(64), { height: 63, water: Water.Deep })).toBe("deep water");
  });
});
