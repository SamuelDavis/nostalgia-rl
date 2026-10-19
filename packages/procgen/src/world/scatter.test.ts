import { describe, expect, it } from "vitest";
import { contains, distance } from "../core/geometry";
import { rngOf } from "../core/hash";
import { grid } from "./grid";
import { scatter, spaced, sprinkle } from "./scatter";

const cells = grid(32);
const rng = rngOf(1, "scatter");
const area = cells.cellsAround({ col: 0, row: 0 }, 4);

describe("scatter", () => {
  it("puts each cell's points on whole tiles inside the cell, clear of its margin", () => {
    const points = scatter({ grid: cells, rng, count: 3, margin: 4 });
    for (const cell of area) {
      const inner = cells.boundsOf(cell);
      expect(points(cell)).toHaveLength(3);
      for (const p of points(cell)) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        expect(
          contains({ minX: inner.minX + 4, minY: inner.minY + 4, maxX: inner.maxX - 4, maxY: inner.maxY - 4 }, p),
        ).toBe(true);
      }
    }
  });

  it("answers per cell, whatever cells were asked before", () => {
    const points = scatter({ grid: cells, rng, count: (cell) => (cell.col + 10) % 3 });
    const forward = area.map(points);
    const backward = [...area].reverse().map(points).reverse();
    expect(backward).toEqual(forward);
  });
});

describe("spaced", () => {
  it("keeps the higher-ranked of any two points closer than the radius, consistently across cells", () => {
    const points = scatter({ grid: cells, rng, count: 4 });
    const kept = spaced(points, { grid: cells, radius: 20, rank: (p) => rng.unit(p.x, p.y) });
    const all = area.flatMap(kept);
    const interior = all.filter((p) => Math.abs(p.x) < 96 && Math.abs(p.y) < 96);
    for (const p of interior) for (const q of all) if (p !== q) expect(distance(p, q)).toBeGreaterThan(20);
    expect(interior.length).toBeGreaterThan(10);
  });
});

describe("sprinkle", () => {
  it("covers tiles in proportion to density", () => {
    const covered = sprinkle(rng, (x) => (x < 0 ? 0 : 0.5));
    let left = 0;
    let right = 0;
    for (let y = 0; y < 100; y++) for (let x = -100; x < 100; x++) if (covered(x, y)) x < 0 ? left++ : right++;
    expect(left).toBe(0);
    expect(right / 10_000).toBeCloseTo(0.5, 1);
  });
});
