export const SURFACE = "surface";

export interface CaveFloor {
  readonly cave: number;
  readonly floor: number;
}

export type Layer = typeof SURFACE | CaveFloor;

export const layerKey = (layer: Layer): string => (layer === SURFACE ? SURFACE : `${layer.cave}:${layer.floor}`);
