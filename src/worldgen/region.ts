import { type Point, floorDiv } from "../lib";
import { REGION_SIZE } from "./constants";

export interface Region {
  readonly cx: number;
  readonly cy: number;
}

export const regionOf = (p: Point): Region => ({
  cx: floorDiv(p.x, REGION_SIZE),
  cy: floorDiv(p.y, REGION_SIZE),
});

export const regionKey = ({ cx, cy }: Region) => `${cx},${cy}`;

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const boundsOf = (points: readonly Point[], margin: number): Bounds => ({
  minX: Math.min(...points.map((p) => p.x)) - margin,
  minY: Math.min(...points.map((p) => p.y)) - margin,
  maxX: Math.max(...points.map((p) => p.x)) + margin,
  maxY: Math.max(...points.map((p) => p.y)) + margin,
});

export const regionBounds = ({ cx, cy }: Region): Bounds => ({
  minX: cx * REGION_SIZE,
  minY: cy * REGION_SIZE,
  maxX: (cx + 1) * REGION_SIZE,
  maxY: (cy + 1) * REGION_SIZE,
});

export const overlaps = (a: Bounds, b: Bounds) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

export const regionsAround = ({ cx, cy }: Region, radius: number): Region[] => {
  const side = 2 * radius + 1;
  return Array.from({ length: side * side }, (_, i) => ({
    cx: cx - radius + (i % side),
    cy: cy - radius + Math.floor(i / side),
  }));
};
