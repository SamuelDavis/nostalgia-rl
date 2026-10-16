export const CHUNK_SIZE = 32;
export const MACRO_SIZE = 256;
export const HEIGHT_LEVELS = 16;
export const SEA_LEVEL = 4;

export const heightLevel = (elevation: number): number =>
  Math.min(HEIGHT_LEVELS - 1, Math.floor(elevation * HEIGHT_LEVELS));
