import { type Bounds, type Vec2 } from "../core/geometry";
import { floorDiv } from "../core/math";

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export interface Grid {
  readonly size: number;
  cellOf(p: Vec2): Cell;
  boundsOf(cell: Cell): Bounds;
  cellsAround(cell: Cell, ring: number): Cell[];
  cellsOverlapping(bounds: Bounds): Cell[];
}

export const cellKey = ({ col, row }: Cell): string => `${col},${row}`;

const cellsBetween = (minCol: number, minRow: number, maxCol: number, maxRow: number): Cell[] => {
  const cells: Cell[] = [];
  for (let row = minRow; row <= maxRow; row++) for (let col = minCol; col <= maxCol; col++) cells.push({ col, row });
  return cells;
};

export const grid = (size: number): Grid => ({
  size,
  cellOf: (p) => ({ col: floorDiv(p.x, size), row: floorDiv(p.y, size) }),
  boundsOf: ({ col, row }) => ({
    minX: col * size,
    minY: row * size,
    maxX: (col + 1) * size - 1,
    maxY: (row + 1) * size - 1,
  }),
  cellsAround: ({ col, row }, ring) => cellsBetween(col - ring, row - ring, col + ring, row + ring),
  cellsOverlapping: ({ minX, minY, maxX, maxY }) =>
    cellsBetween(floorDiv(minX, size), floorDiv(minY, size), floorDiv(maxX, size), floorDiv(maxY, size)),
});
