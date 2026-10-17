import { type Point, distance, findPath } from "../lib";

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

export interface RouteCosts {
  readonly gradeLevel: (p: Point) => number;
  readonly isOpen: (p: Point) => boolean;
  readonly unitCost: UnitCost;
  readonly typicalUnitCost: number;
}

export const route = (
  from: Point,
  to: Point,
  { gradeLevel, isOpen, unitCost, typicalUnitCost }: RouteCosts,
): Point[] | undefined => {
  const minX = Math.min(from.x, to.x) - MARGIN;
  const maxX = Math.max(from.x, to.x) + MARGIN;
  const minY = Math.min(from.y, to.y) - MARGIN;
  const maxY = Math.max(from.y, to.y) + MARGIN;
  const toGrid = (v: number) => Math.round(v / STEP);
  const toWorld = (g: Point): Point => ({ x: g.x * STEP, y: g.y * STEP });
  const openness = new Map<number, boolean>();
  const isOpenAtHalfGrid = (hx: number, hy: number) => {
    const k = hx * 200_003 + hy;
    if (!openness.has(k)) openness.set(k, isOpen({ x: (hx * STEP) / 2, y: (hy * STEP) / 2 }));
    return openness.get(k)!;
  };
  const stepIsOpen = (a: Point, b: Point) =>
    isOpenAtHalfGrid(2 * b.x, 2 * b.y) && isOpenAtHalfGrid(a.x + b.x, a.y + b.y);
  const goal = { x: toGrid(to.x), y: toGrid(to.y) };
  const levels = new Map<number, number>();
  const key = (g: Point) => g.x * 100_003 + g.y;
  const gridLevel = (g: Point) => {
    const k = key(g);
    if (!levels.has(k)) levels.set(k, gradeLevel(toWorld(g)));
    return levels.get(k)!;
  };
  const inBounds = (g: Point) => g.x * STEP >= minX && g.x * STEP <= maxX && g.y * STEP >= minY && g.y * STEP <= maxY;
  const path = findPath<Point>({
    start: { x: toGrid(from.x), y: toGrid(from.y) },
    isGoal: (g) => g.x === goal.x && g.y === goal.y,
    neighbors: (g) => MOVES.map((m) => ({ x: g.x + m.x, y: g.y + m.y })).filter((n) => inBounds(n) && stepIsOpen(g, n)),
    cost: (a, b) => {
      const length = distance(a, b);
      const grade = Math.abs(gridLevel(a) - gridLevel(b)) / (length * STEP);
      return length * unitCost(grade, toWorld(b));
    },
    heuristic: (g) => distance(g, goal) * typicalUnitCost,
    keyOf: key,
    maxExpansions: MAX_EXPANSIONS,
  });
  return path?.map(toWorld);
};
