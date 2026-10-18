import { describe, expect, it } from "vitest";
import { distance, memoize } from "../../lib";
import { MAX_CLIMB, heightLevel } from "../constants";
import { findPeak } from "../landmarks";
import { regionsAround } from "../region";
import { createWorldgen } from "../world";
import { CEILING, FLOOR_SPACING, createCavePlans } from "./plan";
import { createCaveSiting } from "./siting";

const worldOf = memoize(createWorldgen, String, 4);
const plansOf = memoize(
  (seed: number) => {
    const { fields } = worldOf(seed);
    const siting = createCaveSiting({ seed, fields, peakOf: (r) => findPeak(fields, r) });
    const caves = regionsAround({ rx: 0, ry: 0 }, 5).flatMap(siting.cavesIn);
    return { fields, siting, caves, plans: createCavePlans({ seed, fields, caveOwning: siting.caveOwning }) };
  },
  String,
  4,
);

const isCardinalStep = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

describe("cave plans", () => {
  it("opens one mouth on the cave's slope, level with the ground outside", () => {
    for (const seed of [1, 2, 3]) {
      const { fields, siting, caves, plans } = plansOf(seed);
      for (const cave of caves) {
        const { mouth } = plans.planOf(cave);
        expect(isCardinalStep(mouth.inside, mouth.outside)).toBe(true);
        expect(siting.caveOwning(mouth.inside)?.id).toBe(cave.id);
        expect(heightLevel(fields.elevation(mouth.outside.x + 0.5, mouth.outside.y + 0.5))).toBe(mouth.level);
        mouth.passage.forEach((p, i) => expect(isCardinalStep(p, mouth.passage[i + 1] ?? mouth.outside)).toBe(true));
      }
    }
  });

  it("stacks floors a fixed spacing apart around the mouth floor", () => {
    const { caves, plans } = plansOf(1);
    for (const cave of caves) {
      const plan = plans.planOf(cave);
      expect(plan.top).toBeGreaterThanOrEqual(0);
      expect(plan.bottom).toBeLessThanOrEqual(0);
      expect(plan.baseOf(-2) - plan.baseOf(0)).toBe(-2 * FLOOR_SPACING);
    }
    expect(caves.some((cave) => plans.planOf(cave).bottom < -2)).toBe(true);
  });

  it("joins each floor to the one below by a ramp under rock, within climbing steps", () => {
    for (const seed of [1, 2, 3]) {
      const { fields, siting, caves, plans } = plansOf(seed);
      for (const cave of caves) {
        const plan = plans.planOf(cave);
        for (let floor = plan.top; floor > plan.bottom; floor--) {
          const ramp = plans.rampBelow(cave, floor)!;
          expect(ramp, `cave ${cave.id} floor ${floor}`).toBeDefined();
          expect(ramp.tiles[0]!.level).toBe(plan.baseOf(floor));
          expect(ramp.tiles.at(-1)!.level).toBe(plan.baseOf(floor - 1));
          ramp.tiles.forEach((tile, i) => {
            const next = ramp.tiles[i + 1];
            expect(siting.caveOwning(tile)?.id).toBe(cave.id);
            expect(heightLevel(fields.elevation(tile.x + 0.5, tile.y + 0.5))).toBeGreaterThanOrEqual(
              tile.level + CEILING,
            );
            if (next) {
              expect(isCardinalStep(tile, next)).toBe(true);
              expect(Math.abs(tile.level - next.level)).toBeLessThanOrEqual(MAX_CLIMB);
            }
          });
          const above = floor < plan.top ? plans.rampBelow(cave, floor + 1) : undefined;
          if (above) for (const a of above.tiles) for (const b of ramp.tiles) expect(distance(a, b)).toBeGreaterThan(3);
        }
      }
    }
  });
});
