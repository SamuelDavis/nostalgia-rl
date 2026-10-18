import { describe, expect, it } from "vitest";
import { distance, memoize } from "../../lib";
import { MAX_CLIMB, heightLevel } from "../constants";
import { findPeak } from "../landmarks";
import { regionsAround } from "../region";
import { createWorldgen } from "../world";
import { createJunctions } from "./junctions";
import { CEILING, createCavePlans } from "./plan";
import { TERRITORY_RADIUS, createCaveSiting } from "./siting";

const junctionWorldOf = memoize(
  (seed: number) => {
    const { fields } = createWorldgen(seed);
    const siting = createCaveSiting({ seed, fields, peakOf: (r) => findPeak(fields, r) });
    const plans = createCavePlans({ seed, fields, caveOwning: siting.caveOwning });
    const junctions = createJunctions({ seed, fields, siting, plans });
    return { fields, siting, plans, junctions, caves: regionsAround({ rx: 0, ry: 0 }, 5).flatMap(siting.cavesIn) };
  },
  String,
  4,
);

describe("cave junctions", () => {
  it("meet at adjacent border tiles at one level, on floors both caves have", () => {
    for (const seed of [1, 2, 3]) {
      const { fields, siting, plans, junctions, caves } = junctionWorldOf(seed);
      for (const cave of caves)
        for (const junction of junctions.junctionsOf(cave)) {
          const { top, bottom, baseOf } = plans.planOf(cave);
          const [border, ...inward] = junction.tiles;
          expect(junction.floor).toBeLessThanOrEqual(top);
          expect(junction.floor).toBeGreaterThanOrEqual(bottom);
          expect(junction.tiles.at(-1)!.level).toBe(baseOf(junction.floor));
          expect(distance(border!, junction.across)).toBe(1);
          const back = junctions.junctionsOf(junction.other.cave).find((j) => j.other.cave.id === cave.id)!;
          expect(back.floor).toBe(junction.other.floor);
          expect(back.tiles[0]).toEqual({ ...junction.across, level: border!.level });
          [border!, ...inward].forEach((tile, i) => {
            expect(siting.caveOwning(tile)?.id).toBe(cave.id);
            expect(heightLevel(fields.elevation(tile.x + 0.5, tile.y + 0.5))).toBeGreaterThanOrEqual(
              tile.level + CEILING,
            );
            const next = inward[i];
            if (next) expect(Math.abs(tile.level - next.level)).toBeLessThanOrEqual(MAX_CLIMB);
          });
        }
    }
  });

  it("join most neighbouring caves", () => {
    let pairs = 0;
    let joined = 0;
    for (const seed of [1, 2, 3]) {
      const { junctions, caves } = junctionWorldOf(seed);
      for (const cave of caves)
        for (const other of caves)
          if (cave.id < other.id && distance(cave, other) <= 2 * TERRITORY_RADIUS) {
            pairs++;
            if (junctions.junctionsOf(cave).some((j) => j.other.cave.id === other.id)) joined++;
          }
    }
    expect(pairs).toBeGreaterThan(5);
    expect(joined / pairs).toBeGreaterThan(0.4);
  });
});
