import { describe, expect, it } from "vitest";
import { type Point, memoize } from "../../lib";
import { MAX_CLIMB, heightLevel } from "../constants";
import { findPeak } from "../landmarks";
import { regionsAround } from "../region";
import { createWorldgen } from "../world";
import { createCaveFloors } from "./floor";
import { createJunctions } from "./junctions";
import { CEILING, RAMP_LINK, createCavePlans } from "./plan";
import { createCaveSiting } from "./siting";

const caveWorldOf = memoize(
  (seed: number) => {
    const { fields } = createWorldgen(seed);
    const siting = createCaveSiting({ seed, fields, peakOf: (r) => findPeak(fields, r) });
    const plans = createCavePlans({ seed, fields, caveOwning: siting.caveOwning });
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

  it("leaves each ramp half to its own floor", () => {
    const { plans, floors, caves } = caveWorldOf(1);
    const cave = caves.find((c) => plans.planOf(c).bottom < 0)!;
    const ramp = plans.rampBelow(cave, 0)!;
    const [upper, lower] = [floors.floorOf(cave, 0), floors.floorOf(cave, -1)];
    ramp.tiles.forEach((tile, i) => {
      expect(upper.isOpen(tile)).toBe(i < RAMP_LINK);
      expect(lower.isOpen(tile)).toBe(i >= RAMP_LINK);
      expect((i < RAMP_LINK ? upper : lower).levelAt(tile)).toBe(tile.level);
      expect(upper.rampAt(tile)).toBe(i === RAMP_LINK - 1 ? "down" : i < RAMP_LINK ? "slope" : undefined);
      expect(lower.rampAt(tile)).toBe(i === RAMP_LINK ? "up" : i > RAMP_LINK ? "slope" : undefined);
    });
  });
});
