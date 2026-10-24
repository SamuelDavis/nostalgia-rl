import { describe, expect, it } from "vitest";
import { type Vec2, distance, memoize, samePoint } from "procgen";
import { Cover, MinorKind, Prop, REGION_SIZE, SURFACE, createWorldgen, regions } from "../worldgen";
import { blockerBetween, stepToward, Direction } from "./movement";
import { generatedLayers } from "./terrain";

const SEEDS = [1, 2, 3];
const NEARBY = 3;
const USUAL = 0.9;
const USUAL_WALK = 150;
const LONGEST_WALK = 250;
const LAND = 0.25;
const PROBE = 32;

const worldOf = memoize(
  (seed: number) => {
    const world = createWorldgen(seed);
    const cells = regions.cellsAround({ col: 0, row: 0 }, NEARBY);
    return {
      world,
      layers: generatedLayers(world),
      minors: cells.flatMap(world.minorsIn),
      farms: cells.flatMap(world.farmsIn),
      interests: cells.flatMap((region): Vec2[] => [
        ...world.minorsIn(region).map(({ anchor }) => anchor),
        ...world.farmsIn(region).map(({ anchor }) => anchor),
        ...(world.campAt(region) ? [world.campAt(region)!] : []),
        ...world.settlementsIn(region).map(({ anchor }) => anchor),
        ...world.deepForestsIn(region).map(({ layout }) => layout.glade),
        ...world.caveMouthsIn(region).map(({ inside }) => inside),
      ]),
    };
  },
  String,
  3,
);

describe("world variety", () => {
  it("offers every common kind of minor feature near the origin", { tags: "slow" }, () => {
    const kinds = new Set(SEEDS.flatMap((seed) => worldOf(seed).minors.map(({ anchor }) => anchor.kind)));
    const common: MinorKind[] = Object.values(MinorKind).filter((kind) => kind !== MinorKind.StandingStones);
    expect([...kinds].filter((kind) => common.includes(kind)).sort()).toEqual([...common].sort());
  });

  it("raises standing stones in uncanny provinces", { tags: "slow" }, () => {
    const { world } = worldOf(3);
    const uncanny = world.provincesAround({ x: 0, y: 0 }).filter(({ identity }) => identity === "uncanny");
    expect(uncanny.length).toBeGreaterThan(0);
    const stones = uncanny.flatMap((seat) =>
      regions
        .cellsAround(regions.cellOf(seat), 1)
        .flatMap(world.minorsIn)
        .filter(({ anchor }) => anchor.kind === MinorKind.StandingStones),
    );
    expect(stones.length).toBeGreaterThan(0);
  });

  it("grows farms that supply the settlement they surround", { tags: "slow" }, () => {
    for (const seed of SEEDS) {
      const { world, farms } = worldOf(seed);
      expect(farms.length, `seed ${seed}`).toBeGreaterThan(0);
      for (const { anchor, layout } of farms) {
        const target = layout.purpose.relation!.target;
        const supplied = world.settlementsIn(regions.cellOf(target)).find((s) => samePoint(s.anchor, target));
        expect(supplied, `farm at ${anchor.x},${anchor.y}`).toBeDefined();
      }
    }
  });

  it("rarely leaves a walker far from something interesting", { tags: "slow" }, () => {
    for (const seed of SEEDS) {
      const { world, interests } = worldOf(seed);
      const gaps: number[] = [];
      for (let x = -2 * REGION_SIZE; x < 2 * REGION_SIZE; x += PROBE)
        for (let y = -2 * REGION_SIZE; y < 2 * REGION_SIZE; y += PROBE)
          if (world.fields.conditions(x, y).elevation >= LAND)
            gaps.push(Math.min(...interests.map((p) => distance(p, { x, y }))));
      gaps.sort((a, b) => a - b);
      expect(gaps[Math.floor(gaps.length * USUAL)], `seed ${seed}`).toBeLessThanOrEqual(USUAL_WALK);
      expect(gaps.at(-1), `seed ${seed}`).toBeLessThanOrEqual(LONGEST_WALK);
    }
  });

  it("lets walkers in at the door of every farm and minor building", { tags: "slow" }, () => {
    for (const seed of SEEDS) {
      const { layers, minors, farms } = worldOf(seed);
      const terrain = layers.terrainOn(SURFACE);
      for (const building of [...minors, ...farms].flatMap(({ layout }) => layout.buildings)) {
        const outside = building.path[0] ?? building.door;
        const facing = Object.values(Direction).find((d) => {
          const p = stepToward(building.door, d);
          return p.x === outside.x && p.y === outside.y;
        });
        expect(facing, `${building.plan.kind} at ${building.door.x},${building.door.y}`).toBeDefined();
        const [from, to] = [terrain(outside.x, outside.y), terrain(building.door.x, building.door.y)];
        expect(
          blockerBetween(from, to),
          `${building.plan.kind} at ${building.door.x},${building.door.y}`,
        ).toBeUndefined();
      }
    }
  });

  it("marks the mouth of every small cave and lets walkers in through it", { tags: "slow" }, () => {
    for (const seed of SEEDS) {
      const { layers, minors } = worldOf(seed);
      const terrain = layers.terrainOn(SURFACE);
      for (const { anchor, bounds } of minors.filter(({ anchor }) => anchor.kind === MinorKind.SmallCave)) {
        const mouths: Vec2[] = [];
        for (let y = bounds.minY; y <= bounds.maxY; y++)
          for (let x = bounds.minX; x <= bounds.maxX; x++)
            if (terrain(x, y).prop === Prop.Hollow) mouths.push({ x, y });
        expect(mouths, `small cave at ${anchor.x},${anchor.y}`).toHaveLength(1);
        const mouth = terrain(mouths[0]!.x, mouths[0]!.y);
        const isEnterable = Object.values(Direction).some((d) => {
          const p = stepToward(mouths[0]!, d);
          const outside = terrain(p.x, p.y);
          return outside.cover === Cover.None && !blockerBetween(outside, mouth);
        });
        expect(isEnterable, `small cave at ${anchor.x},${anchor.y}`).toBe(true);
      }
    }
  });
});
