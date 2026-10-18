import { describe, expect, it } from "vitest";
import { distance, memoize } from "../../lib";
import { MOUNTAIN_LEVEL } from "../biome";
import { heightLevel } from "../constants";
import { findPeak } from "../landmarks";
import { regionsAround } from "../region";
import { createWorldgen } from "../world";
import { CAVE_SPACING, TERRITORY_RADIUS, createCaveSiting } from "./siting";

const worldOf = memoize(createWorldgen, String, 4);
const sitingOf = memoize(
  (seed: number) =>
    createCaveSiting({ seed, fields: worldOf(seed).fields, peakOf: (r) => findPeak(worldOf(seed).fields, r) }),
  String,
  4,
);
const ORIGIN = { rx: 0, ry: 0 };
const regions = regionsAround(ORIGIN, 6);
const inner = regionsAround(ORIGIN, 4);

describe("cave siting", () => {
  it("anchors caves on mountains, spaced apart", () => {
    for (const seed of [1, 2, 3]) {
      const { fields } = worldOf(seed);
      const caves = regions.flatMap(sitingOf(seed).cavesIn);
      expect(caves.length).toBeGreaterThan(3);
      for (const cave of caves) {
        expect(heightLevel(fields.elevation(cave.x, cave.y))).toBeGreaterThanOrEqual(MOUNTAIN_LEVEL);
        for (const other of caves) if (other !== cave) expect(distance(cave, other)).toBeGreaterThan(CAVE_SPACING);
      }
    }
  });

  it("gives every massive mountain peak a cave nearby", () => {
    for (const seed of [1, 2, 3]) {
      const siting = sitingOf(seed);
      const caves = regions.flatMap(siting.cavesIn);
      for (const candidate of inner.flatMap((r) => siting.candidateIn(r) ?? []))
        expect(Math.min(...caves.map((cave) => distance(candidate, cave)))).toBeLessThanOrEqual(2 * CAVE_SPACING);
    }
  });

  it("gives each tile to at most one cave, within its radius", () => {
    const siting = sitingOf(1);
    const cave = regions.flatMap(siting.cavesIn)[0]!;
    expect(siting.caveOwning(cave)?.id).toBe(cave.id);
    expect(siting.caveOwning({ x: cave.x + TERRITORY_RADIUS + 1, y: cave.y })?.id).not.toBe(cave.id);
    const caves = regions.flatMap(siting.cavesIn);
    for (let i = 0; i < 200; i++) {
      const p = { x: cave.x - 150 + ((i * 37) % 300), y: cave.y - 150 + ((i * 53) % 300) };
      const owner = siting.caveOwning(p);
      if (!owner) continue;
      expect(distance(owner, p)).toBeLessThanOrEqual(TERRITORY_RADIUS);
      for (const other of caves) expect(distance(owner, p)).toBeLessThanOrEqual(distance(other, p));
    }
  });
});
