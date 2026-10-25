import { describe, expect, it } from "vitest";
import { Biome, Ground, Prop, MAX_CLIMB, Water, Way, metresToLevels } from "../worldgen";
import type { Tile } from "./terrain";
import { GRASS } from "./terrain.fixtures";
import {
  Direction,
  STEP_TICKS,
  blockerBetween,
  edgeBetween,
  isImpassable,
  isStairway,
  isSwimming,
  paceOn,
  stepToward,
} from "./movement";

const land = (height: number): Pick<Tile, "height" | "way" | "water" | "prop" | "ground" | "biome"> => ({
  height,
  way: Way.None,
  water: Water.None,
  prop: Prop.None,
  ground: Ground.Grass,
  biome: Biome.Grassland,
});
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

describe("paceOn", () => {
  const paceOnto = (on: Partial<ReturnType<typeof land>>) => paceOn({ ...land(100), ...on });

  it("is the base pace on grass", () => {
    expect(paceOnto({})).toBe(1);
  });

  it("is faster on paths and faster still on roads", () => {
    expect(paceOnto({ way: Way.Path })).toBeLessThan(1);
    expect(paceOnto({ way: Way.Road })).toBeLessThan(paceOnto({ way: Way.Path }));
  });

  it("is a little slower in snow or forest", () => {
    for (const slow of [paceOnto({ ground: Ground.Snow }), paceOnto({ biome: Biome.Forest })]) {
      expect(slow).toBeGreaterThan(1);
      expect(slow).toBeLessThan(1.5);
    }
  });

  it("wades shallow water slower, and swims deep water slower still", () => {
    expect(paceOnto({ water: Water.Shallow })).toBeGreaterThan(paceOnto({ ground: Ground.Snow }));
    expect(paceOnto({ water: Water.Deep })).toBeGreaterThan(paceOnto({ water: Water.Shallow }));
    expect(paceOnto({ water: Water.Deep, prop: Prop.Bridge, way: Way.Road })).toBe(paceOnto({ way: Way.Road }));
  });

  it("pushes through trees at three times the pace", () => {
    expect(paceOnto({ prop: Prop.Oak })).toBe(3);
    expect(paceOnto({ prop: Prop.Pine, biome: Biome.Forest })).toBeCloseTo(3 * paceOnto({ biome: Biome.Forest }));
  });

  it("walks through low plants at the ground's pace", () => {
    for (const prop of [Prop.Bush, Prop.Flowers, Prop.Tuft]) expect(paceOnto({ prop })).toBe(1);
  });
});

describe("edgeBetween", () => {
  const onto = (metres: number, from = land(100)) => edgeBetween(from, land(100 + metresToLevels(metres)));
  const slope = (metres: number) => {
    const edge = onto(metres);
    return edge.climb ? Infinity : edge.pace;
  };
  const climb = (metres: number) => {
    const edge = onto(metres);
    return edge.climb ? edge.ticks : 0;
  };

  it("is level ground at the base pace", () => {
    expect(onto(0)).toEqual({ climb: false, pace: 1 });
  });

  it("slows more the steeper the slope, uphill more than down", () => {
    expect(slope(0.5)).toBeGreaterThan(1);
    expect(slope(1)).toBeGreaterThan(slope(0.5));
    expect(slope(-1)).toBeLessThan(slope(1));
  });

  it("climbs a cliff in time to its height, and climbs down faster", () => {
    expect(climb(2)).toBeGreaterThan(10 * STEP_TICKS);
    expect(climb(30)).toBeGreaterThan(10 * climb(2));
    expect(climb(-30)).toBeLessThan(climb(30));
    expect(climb(-30)).toBeGreaterThan(climb(-2));
  });

  it("takes stairs as a slope, not a climb", () => {
    expect(edgeBetween(path(100), path(116)).climb).toBe(false);
  });

  it("climbs onto obstacles by their height", () => {
    expect(edgeBetween(land(100), { ...land(100), prop: Prop.StandingStone }).climb).toBe(true);
    expect(edgeBetween({ ...land(100), prop: Prop.StandingStone }, land(100)).climb).toBe(true);
  });
});

describe("isImpassable", () => {
  it("is true of walls, rock and buildings, and of nothing that can be crossed", () => {
    for (const prop of [Prop.Wall, Prop.Rock, Prop.Tent, Prop.Shed, Prop.CaveMouth])
      expect(isImpassable({ ...land(100), prop })).toBe(true);
    for (const prop of [Prop.None, Prop.Oak, Prop.Boulder, Prop.Bush])
      expect(isImpassable({ ...land(100), prop })).toBe(false);
  });
});
