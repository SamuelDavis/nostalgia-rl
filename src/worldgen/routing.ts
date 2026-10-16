import { type Point, distance, findPath } from "../lib";
import { SEA_LEVEL } from "./constants";

const STEP = 4;
const MARGIN = 96;
const MAX_EXPANSIONS = 6000;

export type UnitCost = (grade: number, at: Point) => number;

const MOVES: readonly Point[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
].map(([x, y]) => ({ x: x!, y: y! }));

export const route = (
  level: (p: Point) => number,
  from: Point,
  to: Point,
  unitCost: UnitCost,
  typicalUnitCost: number,
): Point[] | undefined => {
  const minX = Math.min(from.x, to.x) - MARGIN;
  const maxX = Math.max(from.x, to.x) + MARGIN;
  const minY = Math.min(from.y, to.y) - MARGIN;
  const maxY = Math.max(from.y, to.y) + MARGIN;
  const toGrid = (v: number) => Math.round(v / STEP);
  const goal = { x: toGrid(to.x), y: toGrid(to.y) };
  const levels = new Map<number, number>();
  const key = (g: Point) => g.x * 100_003 + g.y;
  const gridLevel = (g: Point) => {
    const k = key(g);
    if (!levels.has(k)) levels.set(k, level({ x: g.x * STEP, y: g.y * STEP }));
    return levels.get(k)!;
  };
  const inBounds = (g: Point) => g.x * STEP >= minX && g.x * STEP <= maxX && g.y * STEP >= minY && g.y * STEP <= maxY;
  const path = findPath<Point>({
    start: { x: toGrid(from.x), y: toGrid(from.y) },
    isGoal: (g) => g.x === goal.x && g.y === goal.y,
    neighbors: (g) =>
      MOVES.map((m) => ({ x: g.x + m.x, y: g.y + m.y })).filter((n) => inBounds(n) && gridLevel(n) >= SEA_LEVEL),
    cost: (a, b) => {
      const length = distance(a, b);
      const grade = Math.abs(gridLevel(a) - gridLevel(b)) / (length * STEP);
      return length * unitCost(grade, { x: b.x * STEP, y: b.y * STEP });
    },
    heuristic: (g) => distance(g, goal) * typicalUnitCost,
    keyOf: key,
    maxExpansions: MAX_EXPANSIONS,
  });
  return path?.map((g) => ({ x: g.x * STEP, y: g.y * STEP }));
};
