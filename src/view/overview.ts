import type { Point } from "../lib";
import {
  Biome,
  type Conditions,
  REGION_SIZE,
  Water,
  Way,
  type Worldgen,
  type Bounds,
  biomeOf,
  heightLevel,
  regionOf,
  regionsAround,
} from "../worldgen";
import {
  type HeightMode,
  type Rgb,
  biomeColor,
  contourBetween,
  hillshade,
  mix,
  shade,
  surfaceColor,
  waterColor,
} from "./palette";

export interface Mark {
  readonly point: Point;
  readonly color: Rgb;
  readonly radius: number;
}

const RIVER_MARK: Rgb = [70, 140, 230];
const ROAD_MARK: Rgb = [120, 70, 30];
const TRAIL_MARK: Rgb = [235, 215, 160];
const CAMP_MARK: Rgb = [255, 140, 0];
const GLADE_MARK: Rgb = [170, 255, 120];
const CAVE_MARK: Rgb = [40, 30, 25];
const MINE_MARK: Rgb = [190, 140, 80];
const FEATURE_OUTLINE: Rgb = [0, 0, 0];
const FEATURE_RADIUS = 2;
const DEEP_FOREST_AREA: Rgb = [8, 30, 14];
const DEEP_FOREST_TINT = 0.7;
const INDEX_CONTOUR_SHADE = 0.7;

export interface FieldNeighbours {
  readonly westLevel: number;
  readonly northLevel: number;
  readonly spacing: number;
}

export const fieldColor = (
  mode: HeightMode,
  conditions: Conditions,
  { westLevel, northLevel, spacing }: FieldNeighbours,
): Rgb => {
  const biome = biomeOf(conditions);
  if (biome === Biome.Ocean) return waterColor[Water.Deep];
  const level = heightLevel(conditions.elevation);
  const light = hillshade((level - westLevel) / spacing, (level - northLevel) / spacing);
  const color = surfaceColor(mode, biomeColor[biome], level, light);
  const onIndex = contourBetween(level, westLevel) === "index" || contourBetween(level, northLevel) === "index";
  return onIndex ? shade(color, INDEX_CONTOUR_SHADE) : color;
};

const featureMarks = (point: Point, color: Rgb): Mark[] => [
  { point, color: FEATURE_OUTLINE, radius: FEATURE_RADIUS + 1 },
  { point, color, radius: FEATURE_RADIUS },
];

const squareAround = (radius: number): Point[] =>
  Array.from({ length: (2 * radius + 1) ** 2 }, (_, i) => ({
    x: (i % (2 * radius + 1)) - radius,
    y: Math.floor(i / (2 * radius + 1)) - radius,
  }));

export const markPixels = ({ radius }: Mark): Point[] => squareAround(radius);

const regionsWithin = (center: Point, radius: number) =>
  regionsAround(regionOf(center), Math.ceil(radius / REGION_SIZE));

const lineMarks = (lines: readonly { readonly nodes: readonly Point[] }[], color: Rgb): Mark[] =>
  lines.flatMap(({ nodes }) => nodes.map((point) => ({ point, color, radius: 0 })));

export const overviewFeatureMarks = (world: Worldgen, center: Point, radius: number): Mark[] =>
  regionsWithin(center, radius).flatMap((region) => {
    const camp = world.campAt(region);
    return [
      ...world.deepForestsIn(region).flatMap(({ layout }) => featureMarks(layout.glade, GLADE_MARK)),
      ...(camp ? featureMarks(camp, CAMP_MARK) : []),
      ...world.caveMouthsIn(region).flatMap(({ inside }) => featureMarks(inside, CAVE_MARK)),
      ...world.mineEntrancesIn(region).flatMap(({ inside }) => featureMarks(inside, MINE_MARK)),
    ];
  });

export const overviewMarks = (world: Worldgen, center: Point, radius: number): Mark[] => [
  ...regionsWithin(center, radius).flatMap((region) => [
    ...lineMarks(world.riversNear(region), RIVER_MARK),
    ...world.waysNear(region).flatMap((link) => lineMarks([link], link.way === Way.Road ? ROAD_MARK : TRAIL_MARK)),
  ]),
  ...overviewFeatureMarks(world, center, radius),
];

const isWithin = (p: Point, { minX, minY, maxX, maxY }: Bounds) =>
  p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

export const createOverviewTint = (world: Worldgen, center: Point, radius: number) => {
  const forests = regionsWithin(center, radius).flatMap(world.deepForestsIn);
  return (color: Rgb, p: Point): Rgb =>
    forests.some(({ bounds, layout }) => isWithin(p, bounds) && layout.contains(p))
      ? mix(color, DEEP_FOREST_AREA, DEEP_FOREST_TINT)
      : color;
};
