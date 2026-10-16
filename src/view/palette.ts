import { Biome, Feature, Ground, HEIGHT_LEVELS, SEA_LEVEL, Water } from "../worldgen";

export type Rgb = readonly [number, number, number];

export const CONTOUR_INTERVAL = 4;
const CONTOUR_SHADE = 0.88;

export const biomeColor: Record<Biome, Rgb> = {
  [Biome.Ocean]: [40, 70, 140],
  [Biome.Beach]: [220, 205, 150],
  [Biome.Grassland]: [110, 170, 80],
  [Biome.Forest]: [40, 110, 50],
  [Biome.Desert]: [215, 180, 100],
  [Biome.Mountain]: [130, 120, 115],
};

export const groundColor: Record<Ground, Rgb> = {
  [Ground.Grass]: [100, 165, 75],
  [Ground.Dirt]: [150, 110, 70],
  [Ground.Sand]: [220, 205, 150],
  [Ground.Rock]: [130, 120, 115],
  [Ground.Snow]: [235, 240, 245],
  [Ground.Road]: [175, 140, 95],
};

export const waterColor: Record<Exclude<Water, typeof Water.None>, Rgb> = {
  [Water.Shallow]: [60, 110, 190],
  [Water.Deep]: [30, 60, 130],
};

export const featureColor: Record<Feature, Rgb> = {
  [Feature.None]: [0, 0, 0],
  [Feature.Oak]: [30, 90, 35],
  [Feature.Pine]: [20, 70, 50],
  [Feature.Cactus]: [60, 130, 60],
  [Feature.Bush]: [60, 120, 50],
  [Feature.Boulder]: [90, 85, 80],
  [Feature.Flowers]: [230, 200, 90],
  [Feature.Tuft]: [70, 130, 55],
  [Feature.Tent]: [200, 60, 40],
  [Feature.Campfire]: [255, 160, 0],
  [Feature.Bridge]: [120, 80, 40],
};

const HYPSOMETRIC_STOPS: readonly (readonly [elevation: number, color: Rgb])[] = [
  [0.25, [70, 140, 70]],
  [0.4, [150, 175, 85]],
  [0.55, [200, 170, 95]],
  [0.7, [150, 110, 75]],
  [0.82, [150, 145, 145]],
  [1, [250, 250, 255]],
];

export const shade = ([r, g, b]: Rgb, factor: number): Rgb => [r * factor, g * factor, b * factor];

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const contour = (color: Rgb, level: number): Rgb =>
  Math.floor(level / CONTOUR_INTERVAL) % 2 === 0 ? color : shade(color, CONTOUR_SHADE);

export const hypsometricColor = (level: number): Rgb => {
  const elevation = level / HEIGHT_LEVELS;
  const upper = HYPSOMETRIC_STOPS.findIndex(([stop]) => stop >= elevation);
  if (upper <= 0) return contour(HYPSOMETRIC_STOPS[0]![1], level);
  const [lowStop, low] = HYPSOMETRIC_STOPS[upper - 1]!;
  const [highStop, high] = HYPSOMETRIC_STOPS[upper]!;
  return contour(mix(low, high, (elevation - lowStop) / (highStop - lowStop)), level);
};

export const shadedByHeight = (color: Rgb, level: number): Rgb =>
  contour(shade(color, 0.5 + (0.6 * (level - SEA_LEVEL)) / (HEIGHT_LEVELS - SEA_LEVEL)), level);

export const css = ([r, g, b]: Rgb): string => `rgb(${r | 0} ${g | 0} ${b | 0})`;

export const HEIGHT_MODES = ["shade", "tint"] as const;
export type HeightMode = (typeof HEIGHT_MODES)[number];

export const surfaceColor = (mode: HeightMode, base: Rgb, level: number): Rgb =>
  mode === "tint" ? hypsometricColor(level) : shadedByHeight(base, level);
