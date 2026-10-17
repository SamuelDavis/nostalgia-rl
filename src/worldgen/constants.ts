export const CHUNK_SIZE = 32;
export const REGION_SIZE = 256;
export const HEIGHT_LEVELS = 256;
export const SEA_ELEVATION = 0.25;
export const MAX_CLIMB = 2;

export const heightLevel = (elevation: number): number =>
  Math.min(HEIGHT_LEVELS - 1, Math.floor(elevation * HEIGHT_LEVELS));

export const SEA_LEVEL = heightLevel(SEA_ELEVATION);
