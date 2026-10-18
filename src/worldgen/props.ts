import type { Point } from "../lib";
import { Prop } from "./terrain";

export interface PlacedProp {
  readonly kind: Prop;
  readonly at: Point;
}

const TILE: Point = { x: 1, y: 1 };
const FOOTPRINTS: Partial<Record<Prop, Point>> = {
  [Prop.Tent]: { x: 2, y: 2 },
};

export const footprintOf = (kind: Prop): Point => FOOTPRINTS[kind] ?? TILE;

export const partOf = ({ kind, at }: PlacedProp, p: Point): number | undefined => {
  const { x: width, y: depth } = footprintOf(kind);
  const [dx, dy] = [p.x - at.x, p.y - at.y];
  return dx >= 0 && dx < width && dy >= 0 && dy < depth ? dy * width + dx : undefined;
};

export const tilesOf = (prop: PlacedProp): Point[] => {
  const { x: width, y: depth } = footprintOf(prop.kind);
  return Array.from({ length: width * depth }, (_, i) => ({
    x: prop.at.x + (i % width),
    y: prop.at.y + Math.floor(i / width),
  }));
};
