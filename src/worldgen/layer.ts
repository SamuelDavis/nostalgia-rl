import type { Point } from "../lib";

export const SURFACE = "surface";

export interface CaveFloor {
  readonly cave: Point;
  readonly floor: number;
}

export type Layer = typeof SURFACE | CaveFloor;

export const layerKey = (layer: Layer): string =>
  layer === SURFACE ? SURFACE : `${layer.cave.x},${layer.cave.y}:${layer.floor}`;
