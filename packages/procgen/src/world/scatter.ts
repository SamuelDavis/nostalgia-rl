import { type Vec2, byPosition, distanceSquared, expand } from "../core/geometry";
import type { Rng } from "../core/hash";
import type { Field2 } from "../core/noise";
import type { Cell, Grid } from "./grid";

export type PointsIn<P extends Vec2 = Vec2> = (cell: Cell) => readonly P[];

export interface ScatterOptions {
  readonly grid: Grid;
  readonly rng: Rng;
  readonly count?: number | ((cell: Cell) => number);
  readonly margin?: number;
}

export const scatter =
  ({ grid, rng, count = 1, margin = 0 }: ScatterOptions): PointsIn =>
  (cell) => {
    const { minX, minY } = grid.boundsOf(cell);
    const span = grid.size - 2 * margin;
    const n = typeof count === "number" ? count : count(cell);
    return Array.from({ length: n }, (_, i) => ({
      x: minX + margin + Math.floor(rng.unit(cell.col, cell.row, i, 0) * span),
      y: minY + margin + Math.floor(rng.unit(cell.col, cell.row, i, 1) * span),
    }));
  };

export interface SpacingOptions<P extends Vec2> {
  readonly grid: Grid;
  readonly radius: number;
  readonly rank: (p: P) => number;
}

export const spaced =
  <P extends Vec2>(points: PointsIn<P>, { grid, radius, rank }: SpacingOptions<P>): PointsIn<P> =>
  (cell) => {
    const outranks = (q: P, p: P) => rank(q) > rank(p) || (rank(q) === rank(p) && byPosition(q, p) < 0);
    const rivals = grid.cellsOverlapping(expand(grid.boundsOf(cell), radius)).flatMap(points);
    const limit = radius * radius;
    return points(cell).filter((p) => !rivals.some((q) => q !== p && distanceSquared(p, q) <= limit && outranks(q, p)));
  };

export const sprinkle =
  (rng: Rng, density: Field2) =>
  (x: number, y: number): boolean =>
    rng.unit(x, y) < density(x, y);
