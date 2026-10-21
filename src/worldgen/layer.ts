import type { Vec2 } from "procgen";

export const SURFACE = "surface";

export interface CaveFloor {
  readonly cave: Vec2;
  readonly floor: number;
}

export type Layer = typeof SURFACE | CaveFloor;

export const layerKey = (layer: Layer): string =>
  layer === SURFACE ? SURFACE : `${layer.cave.x},${layer.cave.y}:${layer.floor}`;
