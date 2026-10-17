export const CHUNK_SIZE = 32;
export const REGION_SIZE = 256;
export const HEIGHT_LEVELS = 256;
export const SEA_ELEVATION = 0.25;
export const METRES_PER_LEVEL = 0.5;
export const metresToLevels = (metres: number): number => metres / METRES_PER_LEVEL;
export const MAX_CLIMB = metresToLevels(1);

export const heightLevel = (elevation: number): number =>
  Math.min(HEIGHT_LEVELS - 1, Math.floor(elevation * HEIGHT_LEVELS));

export const SEA_LEVEL = heightLevel(SEA_ELEVATION);
