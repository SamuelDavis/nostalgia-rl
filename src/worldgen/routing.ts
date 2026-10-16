import { type Point, distance, findPath } from "../lib";
import { SEA_LEVEL } from "./constants";

const STEP = 4;
const MARGIN = 96;

export type GradeCost = (grade: number, at: Point) => number;

export const route = (
  level: (p: Point) => number,
  from: Point,
  to: Point,
  gradeCost: GradeCost,
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
      [-1, 0, 1]
        .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: g.x + dx, y: g.y + dy })))
        .filter((n) => (n.x !== g.x || n.y !== g.y) && inBounds(n) && gridLevel(n) >= SEA_LEVEL),
    cost: (a, b) => {
      const length = a.x !== b.x && a.y !== b.y ? Math.SQRT2 : 1;
      const grade = Math.abs(gridLevel(a) - gridLevel(b)) / (length * STEP);
      return length * (1 + gradeCost(grade, { x: b.x * STEP, y: b.y * STEP }));
    },
    heuristic: (g) => distance(g, goal),
    keyOf: key,
  });
  return path?.map((g) => ({ x: g.x * STEP, y: g.y * STEP }));
};
