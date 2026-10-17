import { Biome, Cover, Prop, Ground, HEIGHT_LEVELS, SEA_LEVEL, Water, Way, metresToLevels } from "../worldgen";

export type Rgb = readonly [number, number, number];

export const CONTOUR_INTERVAL = 4;
const INDEX_INTERVAL = CONTOUR_INTERVAL * 5;
const RELIEF_EXAGGERATION = 1;
const LIGHT = { x: -0.25 * Math.SQRT2, y: -0.25 * Math.SQRT2, z: 0.5 * Math.sqrt(3) };
const DEEPEST_SHADOW = 0.6;
const RELIEF_REACH = metresToLevels(4);
const RELIEF_LIGHTEN = 0.35;
const RELIEF_DARKEN = 0.5;

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
};

export const wayColor: Record<Exclude<Way, typeof Way.None>, Rgb> = {
  [Way.Road]: [175, 140, 95],
  [Way.Path]: [215, 185, 130],
};

export const coverColor: Record<Exclude<Cover, typeof Cover.None>, Rgb> = {
  [Cover.Canopy]: [30, 75, 38],
};

export const waterColor: Record<Exclude<Water, typeof Water.None>, Rgb> = {
  [Water.Shallow]: [60, 110, 190],
  [Water.Deep]: [30, 60, 130],
};

export const propColor: Record<Prop, Rgb> = {
  [Prop.None]: [0, 0, 0],
  [Prop.Oak]: [30, 90, 35],
  [Prop.Pine]: [20, 70, 50],
  [Prop.Cactus]: [60, 130, 60],
  [Prop.Bush]: [60, 120, 50],
  [Prop.Boulder]: [90, 85, 80],
  [Prop.Flowers]: [230, 200, 90],
  [Prop.Tuft]: [70, 130, 55],
  [Prop.Tent]: [200, 60, 40],
  [Prop.Campfire]: [255, 160, 0],
  [Prop.Bridge]: [120, 80, 40],
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

export type Contour = "none" | "minor" | "index";

const crosses = (a: number, b: number, interval: number) => Math.floor(a / interval) !== Math.floor(b / interval);

export const contourBetween = (a: number, b: number): Contour =>
  crosses(a, b, INDEX_INTERVAL) ? "index" : crosses(a, b, CONTOUR_INTERVAL) ? "minor" : "none";

export const hillshade = (eastwardRise: number, southwardRise: number): number => {
  const nx = -eastwardRise * RELIEF_EXAGGERATION;
  const ny = -southwardRise * RELIEF_EXAGGERATION;
  const lit = (nx * LIGHT.x + ny * LIGHT.y + LIGHT.z) / Math.sqrt(nx * nx + ny * ny + 1);
  return Math.max(DEEPEST_SHADOW, lit / LIGHT.z);
};

export const hypsometricColor = (level: number): Rgb => {
  const elevation = level / HEIGHT_LEVELS;
  const upper = HYPSOMETRIC_STOPS.findIndex(([stop]) => stop >= elevation);
  if (upper <= 0) return HYPSOMETRIC_STOPS[0]![1];
  const [lowStop, low] = HYPSOMETRIC_STOPS[upper - 1]!;
  const [highStop, high] = HYPSOMETRIC_STOPS[upper]!;
  return mix(low, high, (elevation - lowStop) / (highStop - lowStop));
};

export type HeightShade = (level: number) => number;

export const absoluteHeightShade: HeightShade = (level) =>
  0.5 + (0.6 * (level - SEA_LEVEL)) / (HEIGHT_LEVELS - SEA_LEVEL);

export const UNSHADED: HeightShade = () => 1;

export type Rgba = readonly [number, number, number, number];

export const reliefTint = (rise: number): Rgba => {
  const relief = rise / (Math.abs(rise) + RELIEF_REACH);
  return relief >= 0 ? [255, 255, 255, RELIEF_LIGHTEN * relief] : [0, 0, 0, -RELIEF_DARKEN * relief];
};

export const css = ([r, g, b]: Rgb): string => `rgb(${r | 0} ${g | 0} ${b | 0})`;

export const HEIGHT_MODES = ["shade", "tint"] as const;
export type HeightMode = (typeof HEIGHT_MODES)[number];

export const surfaceColor = (
  mode: HeightMode,
  base: Rgb,
  level: number,
  light: number,
  heightShade: HeightShade = absoluteHeightShade,
): Rgb => shade(mode === "tint" ? hypsometricColor(level) : shade(base, heightShade(level)), light);
