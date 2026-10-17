import { type Point, floorDiv } from "../lib";
import { REGION_SIZE } from "./constants";

export interface Region {
  readonly rx: number;
  readonly ry: number;
}

export const regionOf = (p: Point): Region => ({
  rx: floorDiv(p.x, REGION_SIZE),
  ry: floorDiv(p.y, REGION_SIZE),
});

export const regionKey = ({ rx, ry }: Region) => `${rx},${ry}`;

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

export const regionBounds = ({ rx, ry }: Region): Bounds => ({
  minX: rx * REGION_SIZE,
  minY: ry * REGION_SIZE,
  maxX: (rx + 1) * REGION_SIZE,
  maxY: (ry + 1) * REGION_SIZE,
});

export const overlaps = (a: Bounds, b: Bounds) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

export const regionsAround = ({ rx, ry }: Region, radius: number): Region[] => {
  const side = 2 * radius + 1;
  return Array.from({ length: side * side }, (_, i) => ({
    rx: rx - radius + (i % side),
    ry: ry - radius + Math.floor(i / side),
  }));
};
