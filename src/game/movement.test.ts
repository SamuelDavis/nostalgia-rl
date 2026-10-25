import { describe, expect, it } from "vitest";
import { Biome, Ground, Prop, MAX_CLIMB, Water, Way, metresToLevels } from "../worldgen";
import type { Tile } from "./terrain";
import { GRASS } from "./terrain.fixtures";
import { Direction, STEP_TICKS, blockerBetween, isStairway, isSwimming, stepToward, strideTicks } from "./movement";

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

describe("strideTicks", () => {
  const ticksOnto = (to: Partial<ReturnType<typeof land>>, from = land(100)) =>
    strideTicks(from, { ...land(100), ...to });
  const grass = ticksOnto({})!;
  const climbing = (metres: number) => ticksOnto({ height: 100 + metresToLevels(metres) })!;
  const descending = (metres: number) => ticksOnto({ height: 100 - metresToLevels(metres) })!;

  it("takes a step's ticks on level grass", () => {
    expect(grass).toBe(STEP_TICKS);
  });

  it("is faster on paths and faster still on roads", () => {
    const path = ticksOnto({ way: Way.Path })!;
    const road = ticksOnto({ way: Way.Road })!;
    expect(path).toBeLessThan(grass);
    expect(road).toBeLessThan(path);
  });

  it("is a little slower in snow or forest", () => {
    for (const slow of [ticksOnto({ ground: Ground.Snow })!, ticksOnto({ biome: Biome.Forest })!]) {
      expect(slow).toBeGreaterThan(grass);
      expect(slow).toBeLessThan(1.5 * grass);
    }
  });

  it("wades shallow water slower, and swims deep water slower still", () => {
    const wading = ticksOnto({ water: Water.Shallow })!;
    const swimming = ticksOnto({ water: Water.Deep })!;
    expect(wading).toBeGreaterThan(ticksOnto({ ground: Ground.Snow })!);
    expect(swimming).toBeGreaterThan(wading);
    expect(ticksOnto({ water: Water.Deep, prop: Prop.Bridge, way: Way.Road })).toBe(ticksOnto({ way: Way.Road }));
  });

  it("pushes through trees at three times the pace", () => {
    expect(ticksOnto({ prop: Prop.Oak })).toBe(3 * grass);
    expect(ticksOnto({ prop: Prop.Pine, biome: Biome.Forest })).toBe(3 * ticksOnto({ biome: Biome.Forest })!);
  });

  it("slows more the steeper the slope, uphill more than down", () => {
    const [gentle, steep] = [climbing(0.5), climbing(1)];
    expect(gentle).toBeGreaterThan(grass);
    expect(steep).toBeGreaterThan(gentle);
    expect(descending(1)).toBeLessThan(steep);
  });

  it("climbs a cliff in time to its height, and climbs down faster", () => {
    expect(climbing(2)).toBeGreaterThan(2 * climbing(1));
    expect(climbing(30)).toBeGreaterThan(10 * climbing(2));
    expect(descending(30)).toBeLessThan(climbing(30));
    expect(descending(30)).toBeGreaterThan(descending(2));
  });

  it("takes stairs as a slope, not a climb", () => {
    expect(strideTicks(path(100), path(116))).toBeLessThan(ticksOnto({ height: 116 }, path(100))!);
  });

  it("climbs over low obstacles in time to their height", () => {
    const boulder = ticksOnto({ prop: Prop.Boulder })!;
    expect(boulder).toBeGreaterThan(grass);
    expect(ticksOnto({ prop: Prop.StandingStone })).toBeGreaterThan(boulder);
  });

  it("cannot pass walls, rock or buildings", () => {
    for (const prop of [Prop.Wall, Prop.Rock, Prop.Tent, Prop.Shed, Prop.CaveMouth])
      expect(ticksOnto({ prop })).toBeUndefined();
  });

  it("walks through low plants at the ground's pace", () => {
    for (const prop of [Prop.Bush, Prop.Flowers, Prop.Tuft]) expect(ticksOnto({ prop })).toBe(grass);
  });
});
