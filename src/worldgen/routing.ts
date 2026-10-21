import { type Route, type Vec2, distance, routeOnGrid } from "procgen";
import { MAX_CLIMB } from "./constants";

const STEP = 4;
const MARGIN = 96;
const EXPANSIONS_PER_POINT = 2;
const STEEP_PENALTY = 25;

export const climbCost = (grade: number) => (grade <= MAX_CLIMB ? grade : STEEP_PENALTY * grade);

export type UnitCost = (grade: number, at: Vec2) => number;

export interface RouteCosts {
  readonly gradeLevel: (p: Vec2) => number;
  readonly isOpen: (p: Vec2) => boolean;
  readonly unitCost: UnitCost;
  readonly typicalUnitCost: number;
  readonly margin?: number;
}

const cached = <R>(compute: (p: Vec2) => R) => {
  const columns = new Map<number, Map<number, R>>();
  return (p: Vec2): R => {
    let column = columns.get(p.x);
    if (!column) columns.set(p.x, (column = new Map()));
    if (!column.has(p.y)) column.set(p.y, compute(p));
    return column.get(p.y)!;
  };
};

export const route = (
  from: Vec2,
  to: Vec2,
  { gradeLevel, isOpen, unitCost, typicalUnitCost, margin = MARGIN }: RouteCosts,
): Route<Vec2> => {
  const [levelAt, openAt] = [cached(gradeLevel), cached(isOpen)];
  const pointsAcross = (span: number) => Math.floor((span + 2 * margin) / STEP) + 1;
  const points = pointsAcross(Math.abs(to.x - from.x)) * pointsAcross(Math.abs(to.y - from.y));
  return routeOnGrid({
    from,
    to,
    step: STEP,
    margin,
    heuristicCostPerUnit: typicalUnitCost,
    maxExpansions: EXPANSIONS_PER_POINT * points,
    cost: (a, b) => {
      if (!openAt(b) || !openAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) return Infinity;
      const length = distance(a, b);
      return length * unitCost(Math.abs(levelAt(a) - levelAt(b)) / length, b);
    },
  });
};

export const pathOf = (found: Route<Vec2>): Vec2[] | undefined => ("path" in found ? found.path : undefined);
