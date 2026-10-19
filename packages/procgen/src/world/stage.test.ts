import { describe, expect, it } from "vitest";
import { grid } from "./grid";
import { createWorld, reachOf, stage } from "./stage";

const coarse = grid(64);
const fine = grid(16);

const heights = stage({
  name: "heights",
  grid: coarse,
  compute: ({ col, row }, { rng }) => rng.int(0, 9, col, row),
});

describe("grid", () => {
  it("maps points to cells and back, flooring negatives", () => {
    expect(fine.cellOf({ x: -1, y: 16 })).toEqual({ col: -1, row: 1 });
    expect(fine.boundsOf({ col: -1, row: 1 })).toEqual({ minX: -16, minY: 16, maxX: -1, maxY: 31 });
    expect(fine.cellsOverlapping({ minX: -1, minY: 0, maxX: 16, maxY: 15 })).toHaveLength(3);
    expect(fine.cellsAround({ col: 0, row: 0 }, 1)).toHaveLength(9);
  });
});

describe("stages", () => {
  it("compute once per cell and agree across worlds with the same seed", () => {
    let calls = 0;
    const counted = stage({
      name: "counted",
      grid: coarse,
      reads: [{ stage: heights, radius: 0 }],
      compute: (cell, { read }) => {
        calls++;
        return read(heights, cell) * 2;
      },
    });
    const world = createWorld(7);
    expect(world.read(counted, { col: 3, row: -2 })).toBe(world.read(counted, { col: 3, row: -2 }));
    expect(calls).toBe(1);
    expect(createWorld(7).read(counted, { col: 3, row: -2 })).toBe(world.read(counted, { col: 3, row: -2 }));
  });

  it("read across grids within their declared radius", () => {
    const neighbourhood = stage({
      name: "neighbourhood",
      grid: fine,
      reads: [{ stage: heights, radius: 16 }],
      compute: (cell, { readAt }) => readAt(heights, { x: fine.boundsOf(cell).minX, y: 0 }),
    });
    expect(createWorld(1).read(neighbourhood, { col: 4, row: 0 })).toBe(
      createWorld(1).read(heights, { col: 1, row: 0 }),
    );
  });

  it("refuse reads beyond the declared radius, or of undeclared stages", () => {
    const overreach = stage({
      name: "overreach",
      grid: fine,
      reads: [{ stage: heights, radius: 16 }],
      compute: (_, { read }) => read(heights, { col: 5, row: 0 }),
    });
    const undeclared = stage({
      name: "undeclared",
      grid: fine,
      compute: (_, { read }) => read(heights, { col: 0, row: 0 }),
    });
    expect(() => createWorld(1).read(overreach, { col: 0, row: 0 })).toThrow(/beyond its radius/);
    expect(() => createWorld(1).read(undeclared, { col: 0, row: 0 })).toThrow(/without declaring/);
  });

  it("gather a list stage over bounds", () => {
    const points = stage({ name: "points", grid: fine, compute: ({ col, row }) => [{ col, row }] });
    expect(createWorld(1).gather(points, { minX: 0, minY: 0, maxX: 31, maxY: 15 })).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
  });

  it("refuse two different stages with one name", () => {
    const world = createWorld(1);
    world.read(heights, { col: 0, row: 0 });
    const impostor = stage({ name: "heights", grid: coarse, compute: () => 0 });
    expect(() => world.read(impostor, { col: 0, row: 0 })).toThrow(/Two stages/);
  });

  it("sum the reach of everything a cell depends on", () => {
    const near = stage({ name: "near", grid: fine, reads: [{ stage: heights, radius: 10 }], compute: () => 0 });
    const far = stage({ name: "far", grid: fine, reads: [{ stage: near, radius: 5 }], compute: () => 0 });
    expect(reachOf(heights)).toBe(0);
    expect(reachOf(far)).toBe(5 + 16 + 10 + 64);
  });
});
