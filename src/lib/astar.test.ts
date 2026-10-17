import { describe, expect, it } from "vitest";
import { findPath } from "./astar";

const grid = ["....", ".##.", "...."];
type Region = readonly [number, number];
const walkable = ([x, y]: Region) => grid[y]?.[x] === ".";
const neighbors = ([x, y]: Region): Region[] =>
  (
    [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as Region[]
  ).filter(walkable);

const search = (start: Region, goal: Region) =>
  findPath<Region>({
    start,
    isGoal: ([x, y]) => x === goal[0] && y === goal[1],
    neighbors,
    cost: () => 1,
    heuristic: ([x, y]) => Math.abs(x - goal[0]) + Math.abs(y - goal[1]),
    keyOf: ([x, y]) => x * 100 + y,
  });

describe("findPath", () => {
  it("finds a shortest path around obstacles", () => {
    const path = search([0, 1], [3, 1]);
    expect(path).toHaveLength(6);
    expect(path![0]).toEqual([0, 1]);
    expect(path!.at(-1)).toEqual([3, 1]);
  });

  it("returns undefined when unreachable", () => {
    expect(search([0, 0], [1, 1])).toBeUndefined();
  });
});
