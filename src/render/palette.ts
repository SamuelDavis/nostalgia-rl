import { Biome, Cover, Prop, Ground, HEIGHT_LEVELS, SEA_LEVEL, Water, Way, metresToLevels } from "../worldgen";
import type { Tile } from "../game/terrain";

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
  [Ground.Dressed]: [165, 158, 148],
  [Ground.Planks]: [140, 105, 70],
  [Ground.Tilled]: [120, 85, 50],
};

export const wayColor: Record<Exclude<Way, typeof Way.None>, Rgb> = {
  [Way.Road]: [175, 140, 95],
  [Way.Path]: [215, 185, 130],
};

export const coverColor: Record<Exclude<Cover, typeof Cover.None>, Rgb> = {
  [Cover.Canopy]: [30, 75, 38],
  [Cover.Thatch]: [200, 165, 70],
  [Cover.Slate]: [95, 100, 115],
  [Cover.Rock]: [105, 98, 92],
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
  [Prop.Rock]: [28, 24, 22],
  [Prop.Stalagmite]: [160, 150, 140],
  [Prop.CaveMouth]: [20, 16, 14],
  [Prop.RampDown]: [235, 215, 170],
  [Prop.RampUp]: [235, 215, 170],
  [Prop.Ramp]: [180, 165, 135],
  [Prop.CaveExit]: [255, 235, 180],
  [Prop.MineEntrance]: [190, 140, 80],
  [Prop.Shed]: [85, 55, 30],
  [Prop.Stockpile]: [95, 90, 88],
  [Prop.Bunkhouse]: [70, 45, 25],
  [Prop.Wall]: [92, 78, 66],
  [Prop.Door]: [235, 200, 140],
  [Prop.Hearth]: [230, 110, 40],
  [Prop.Bed]: [215, 205, 185],
  [Prop.Table]: [235, 205, 160],
  [Prop.Bench]: [210, 175, 130],
  [Prop.Counter]: [235, 205, 160],
  [Prop.Altar]: [245, 225, 150],
  [Prop.Anvil]: [45, 45, 50],
  [Prop.Forge]: [255, 120, 30],
  [Prop.Barrel]: [215, 165, 105],
  [Prop.Hay]: [225, 200, 100],
  [Prop.Well]: [70, 90, 140],
  [Prop.Railing]: [215, 175, 120],
  [Prop.Stump]: [120, 85, 50],
  [Prop.LogPile]: [160, 110, 60],
  [Prop.Crate]: [190, 150, 95],
  [Prop.Stake]: [140, 100, 60],
  [Prop.Bones]: [235, 230, 210],
  [Prop.StandingStone]: [175, 170, 190],
  [Prop.Crop]: [215, 190, 80],
  [Prop.FruitTree]: [70, 130, 40],
  [Prop.Fence]: [170, 130, 80],
  [Prop.Hollow]: [200, 190, 175],
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

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
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

export const mapColorOf = (tile: Tile, mode: HeightMode, light: number): Rgb => {
  if (tile.prop !== Prop.None) return propColor[tile.prop];
  if (tile.water !== Water.None) return waterColor[tile.water];
  if (tile.way !== Way.None) return wayColor[tile.way];
  return surfaceColor(mode, groundColor[tile.ground], tile.height, light);
};
