import { describe, expect, it } from "vitest";
import { type Point, memoize } from "../../lib";
import { MAX_CLIMB, heightLevel } from "../constants";
import { findPeak } from "../landmarks";
import { regionsAround } from "../region";
import { createWorldgen } from "../world";
import { createCaveFloors } from "./floor";
import { createJunctions } from "./junctions";
import { CEILING, createCavePlans } from "./plan";
import { createCaveSiting } from "./siting";

const caveWorldWith = (wayness: number) =>
  memoize(
    (seed: number) => {
      const { fields } = createWorldgen(seed);
      const siting = createCaveSiting({ seed, fields, peakOf: (r) => findPeak(fields, r) });
      const plans = createCavePlans({ seed, fields, caveOwning: siting.caveOwning, waynessAt: () => wayness });
      const { junctionsOf } = createJunctions({ seed, fields, siting, plans });
      const floors = createCaveFloors({ seed, fields, caveOwning: siting.caveOwning, plans, junctionsOf });
      return {
        fields,
        siting,
        plans,
        floors,
        junctionsOf,
        caves: regionsAround({ rx: 0, ry: 0 }, 3).flatMap(siting.cavesIn),
      };
    },
    String,
    4,
  );
const caveWorldOf = caveWorldWith(0);
const mineWorldOf = caveWorldWith(1);

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const reachableFrom = (start: Point, isOpen: (p: Point) => boolean, levelAt: (p: Point) => number) => {
  const key = (p: Point) => `${p.x},${p.y}`;
  const seen = new Set([key(start)]);
  const frontier = [start];
  while (frontier.length > 0) {
    const p = frontier.pop()!;
    for (const o of NEIGHBOURS) {
      const n = { x: p.x + o.x, y: p.y + o.y };
      if (seen.has(key(n)) || !isOpen(n) || Math.abs(levelAt(n) - levelAt(p)) > MAX_CLIMB) continue;
      seen.add(key(n));
      frontier.push(n);
    }
  }
  return seen;
};

describe("cave floors", () => {
  it("connect the mouth and every ramp end on a floor", { tags: "slow" }, () => {
    for (const seed of [1, 2]) {
      const { plans, floors, junctionsOf, caves } = caveWorldOf(seed);
      for (const cave of caves) {
        const plan = plans.planOf(cave);
        for (let floor = plan.top; floor >= plan.bottom; floor--) {
          const layout = floors.floorOf(cave, floor);
          const ends = [
            ...(floor === 0 ? [plan.mouth.inside] : []),
            ...(floor > plan.bottom ? [plans.rampBelow(cave, floor)!.tiles[0]!] : []),
            ...(floor < plan.top ? [plans.rampBelow(cave, floor + 1)!.tiles.at(-1)!] : []),
            ...junctionsOf(cave)
              .filter((j) => j.floor === floor)
              .map((j) => j.tiles[0]!),
          ];
          const reached = reachableFrom(ends[0]!, layout.isOpen, layout.levelAt);
          for (const end of ends) expect(reached.has(`${end.x},${end.y}`), `cave ${cave.id} floor ${floor}`).toBe(true);
        }
      }
    }
  });

  it("keeps rock overhead on nearly every open tile", () => {
    const { fields, plans, floors, caves } = caveWorldOf(1);
    let open = 0;
    let exposed = 0;
    for (const cave of caves) {
      const plan = plans.planOf(cave);
      const passage = new Set(plan.mouth.passage.map((p) => `${p.x},${p.y}`));
      for (let floor = plan.top; floor >= plan.bottom; floor--) {
        const layout = floors.floorOf(cave, floor);
        for (const p of layout.openTiles()) {
          if (passage.has(`${p.x},${p.y}`)) continue;
          open++;
          if (heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5)) < layout.levelAt(p) + CEILING) exposed++;
        }
      }
    }
    expect(open).toBeGreaterThan(1000);
    expect(exposed / open).toBeLessThan(0.02);
  });

  it("marks the mouth on the floor it opens from", () => {
    const { plans, floors, caves } = caveWorldOf(1);
    const cave = caves[0]!;
    const { inside } = plans.planOf(cave).mouth;
    expect(floors.floorOf(cave, 0).markAt(inside)).toBe("exit");
  });

  it("leaves each ramp half to its own floor", () => {
    const { plans, floors, caves } = caveWorldOf(1);
    const cave = caves.find((c) => plans.planOf(c).bottom < 0)!;
    const ramp = plans.rampBelow(cave, 0)!;
    const [upper, lower] = [floors.floorOf(cave, 0), floors.floorOf(cave, -1)];
    const { link } = ramp;
    ramp.tiles.forEach((tile, i) => {
      expect(upper.isOpen(tile)).toBe(i < link);
      expect(lower.isOpen(tile)).toBe(i >= link);
      expect((i < link ? upper : lower).levelAt(tile)).toBe(tile.level);
      expect(upper.markAt(tile)).toBe(i === link - 1 ? "down" : i < link ? "slope" : undefined);
      expect(lower.markAt(tile)).toBe(i === link ? "up" : i > link ? "slope" : undefined);
    });
  });

  it("connect a mine's way in to its stairs on every floor it works", { tags: "slow" }, () => {
    for (const seed of [1, 2]) {
      const { plans, floors, junctionsOf, caves } = mineWorldOf(seed);
      for (const cave of caves) {
        const plan = plans.planOf(cave);
        if (!plan.mine) continue;
        for (let floor = plan.mine.top; floor >= plan.mine.bottom; floor--) {
          const layout = floors.floorOf(cave, floor);
          const [below, above] = [floors.stairBelow(cave, floor), floors.stairBelow(cave, floor + 1)];
          const ends = [
            ...(floor === 0 ? [plan.mouth.inside] : []),
            ...(below ? [below.tiles[0]!] : []),
            ...(above ? [above.tiles.at(-1)!] : []),
            ...junctionsOf(cave)
              .filter((j) => j.floor === floor)
              .map((j) => j.tiles[0]!),
          ];
          if (ends.length === 0) continue;
          const reached = reachableFrom(ends[0]!, layout.isOpen, layout.levelAt);
          for (const end of ends) expect(reached.has(`${end.x},${end.y}`), `cave ${cave.id} floor ${floor}`).toBe(true);
          expect(layout.openTiles().some(layout.isWorked)).toBe(true);
        }
      }
    }
  });

  it("join most of a mine's floors by stairs", () => {
    const { plans, floors, caves } = mineWorldOf(1);
    const mined = caves.map(plans.planOf).filter((plan) => plan.mine);
    const joins = mined.flatMap(({ cave, mine }) =>
      Array.from({ length: mine!.top - mine!.bottom }, (_, i) => floors.stairBelow(cave, mine!.top - i)),
    );
    expect(mined.length).toBeGreaterThan(0);
    expect(joins.filter(Boolean).length / joins.length).toBeGreaterThan(0.8);
  });

  it("lays each stair as a short flight within climbing steps, its halves on their own floors", () => {
    const { plans, floors, caves } = mineWorldOf(1);
    const cave = caves.find((c) => plans.planOf(c).mine && floors.stairBelow(c, 0))!;
    const stair = floors.stairBelow(cave, 0)!;
    const [upper, lower] = [floors.floorOf(cave, 0), floors.floorOf(cave, -1)];
    expect(stair.tiles).toHaveLength(9);
    expect(stair.tiles[0]!.level).toBe(plans.planOf(cave).baseOf(0));
    expect(stair.tiles.at(-1)!.level).toBe(plans.planOf(cave).baseOf(-1));
    stair.tiles.forEach((tile, i) => {
      const next = stair.tiles[i + 1];
      if (next) expect(Math.abs(tile.level - next.level)).toBeLessThanOrEqual(MAX_CLIMB);
      expect(upper.isOpen(tile)).toBe(i < stair.link);
      expect(lower.isOpen(tile)).toBe(i >= stair.link);
      expect((i < stair.link ? upper : lower).levelAt(tile)).toBe(tile.level);
    });
    expect(upper.markAt(stair.tiles[stair.link - 1]!)).toBe("down");
    expect(lower.markAt(stair.tiles[stair.link]!)).toBe("up");
  });
});
