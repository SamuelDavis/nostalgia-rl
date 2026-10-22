import type { Vec2 } from "procgen";

export const SURFACE = "surface";

export interface CaveFloor {
  readonly cave: Vec2;
  readonly floor: number;
}

export interface Storey {
  readonly building: Vec2;
  readonly floor: number;
}

export type Layer = typeof SURFACE | CaveFloor | Storey;

export const isStorey = (layer: Layer): layer is Storey => layer !== SURFACE && "building" in layer;

export const layerKey = (layer: Layer): string => {
  if (layer === SURFACE) return SURFACE;
  if (isStorey(layer)) return `building ${layer.building.x},${layer.building.y}:${layer.floor}`;
  return `${layer.cave.x},${layer.cave.y}:${layer.floor}`;
};
