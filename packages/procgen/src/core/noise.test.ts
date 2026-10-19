import { describe, expect, it } from "vitest";
import { fbm, ridged, simplex2, simplex3, voronoi2, warp } from "./noise";

const grid = (step: number, f: (x: number, y: number) => void) => {
  for (let y = -40; y < 40; y += step) for (let x = -40; x < 40; x += step) f(x, y);
};

describe("noise", () => {
  it("is a pure function of seed and position, distinct per seed", () => {
    expect(simplex2(1)(3.7, -2.1)).toBe(simplex2(1)(3.7, -2.1));
    expect(simplex2(1)(3.7, -2.1)).not.toBe(simplex2(2)(3.7, -2.1));
    expect(simplex3(1)(3.7, -2.1, 0.5)).toBe(simplex3(1)(3.7, -2.1, 0.5));
  });

  it("stays in [-1, 1], centred on zero, and uses most of the range", () => {
    for (const [name, sample] of [
      ["2d", simplex2(5)],
      ["3d", (x: number, y: number) => simplex3(5)(x, y, x * 0.37 - y * 0.21)],
    ] as const) {
      const values: number[] = [];
      grid(0.173, (x, y) => values.push(sample(x, y)));
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const [min, max] = values.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity]);
      expect(min, name).toBeGreaterThanOrEqual(-1);
      expect(max, name).toBeLessThanOrEqual(1);
      expect(max, name).toBeGreaterThan(0.7);
      expect(min, name).toBeLessThan(-0.7);
      expect(Math.abs(mean), name).toBeLessThan(0.05);
    }
  });

  it("is continuous", () => {
    const noise = simplex2(9);
    grid(0.71, (x, y) => expect(Math.abs(noise(x, y) - noise(x + 0.001, y))).toBeLessThan(0.02));
  });

  it("sums octaves into the same range, and ridges peak at the noise's zeros", () => {
    const base = simplex2(3);
    const octaves = fbm(base, { octaves: 4, frequency: 0.05 });
    const ridges = ridged(base, { octaves: 1 });
    grid(1.3, (x, y) => {
      expect(Math.abs(octaves(x, y))).toBeLessThanOrEqual(1);
      expect(ridges(x, y)).toBeCloseTo(1 - 2 * Math.abs(base(x, y)));
    });
  });

  it("warps the domain by offset fields", () => {
    const field = (x: number, y: number) => x + 10 * y;
    const warped = warp(field, [() => 1, () => 2], 0.5);
    expect(warped(0, 0)).toBe(field(0.5, 1));
  });

  it("finds the nearest Voronoi site, stable across a cell", () => {
    const cells = voronoi2(4);
    const sample = cells(10.2, 3.3);
    expect(sample.nearest).toBeLessThanOrEqual(sample.second);
    expect(cells(sample.site.x + 0.01, sample.site.y).id).toBe(sample.id);
    grid(0.9, (x, y) => {
      const { site, nearest } = cells(x, y);
      expect(nearest).toBeCloseTo(Math.hypot(site.x - x, site.y - y));
    });
  });
});
