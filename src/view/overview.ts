import type { Point } from "../lib";
import {
  Biome,
  type Conditions,
  REGION_SIZE,
  Water,
  type Worldgen,
  type Bounds,
  biomeOf,
  heightLevel,
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

const regionsWithin = (world: Worldgen, center: Point, radius: number) => {
  const middle = world.regionOf(center);
  return squareAround(Math.ceil(radius / REGION_SIZE)).map((o) => ({ cx: middle.cx + o.x, cy: middle.cy + o.y }));
};

const lineMarks = (lines: readonly { readonly nodes: readonly Point[] }[], color: Rgb): Mark[] =>
  lines.flatMap(({ nodes }) => nodes.map((point) => ({ point, color, radius: 0 })));

export const overviewFeatureMarks = (world: Worldgen, center: Point, radius: number): Mark[] =>
  regionsWithin(world, center, radius).flatMap(({ cx, cy }) => {
    const camp = world.campAt(cx, cy);
    return [
      ...world.deepForestsIn(cx, cy).flatMap(({ layout }) => featureMarks(layout.glade, GLADE_MARK)),
      ...(camp ? featureMarks(camp, CAMP_MARK) : []),
    ];
  });

export const overviewMarks = (world: Worldgen, center: Point, radius: number): Mark[] => [
  ...regionsWithin(world, center, radius).flatMap(({ cx, cy }) => [
    ...lineMarks(world.riversNear(cx, cy), RIVER_MARK),
    ...lineMarks(world.trailsNear(cx, cy), TRAIL_MARK),
    ...lineMarks(world.roadsFrom(cx, cy), ROAD_MARK),
  ]),
  ...overviewFeatureMarks(world, center, radius),
];

const isWithin = (p: Point, { minX, minY, maxX, maxY }: Bounds) =>
  p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

export const createOverviewTint = (world: Worldgen, center: Point, radius: number) => {
  const forests = regionsWithin(world, center, radius).flatMap(({ cx, cy }) => world.deepForestsIn(cx, cy));
  return (color: Rgb, p: Point): Rgb =>
    forests.some(({ bounds, layout }) => isWithin(p, bounds) && layout.contains(p))
      ? mix(color, DEEP_FOREST_AREA, DEEP_FOREST_TINT)
      : color;
};
