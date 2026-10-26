import { type Vec2, contains } from "procgen";
import {
  Biome,
  type Conditions,
  MinorKind,
  REGION_SIZE,
  Water,
  Way,
  type Worldgen,
  biomeOf,
  heightLevel,
  regions,
} from "../../worldgen";
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
} from "../palette";
import { type MapFrame, type Pixels, createPixels, pixelOf, pointAt } from "./frame";

export interface Mark {
  readonly point: Vec2;
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
const SETTLEMENT_MARK: Rgb = [250, 240, 200];
const FARM_MARK: Rgb = [230, 200, 60];
const MINOR_MARKS: Record<MinorKind, Rgb> = {
  [MinorKind.BanditCamp]: [220, 40, 40],
  [MinorKind.Woodcutter]: [150, 200, 60],
  [MinorKind.Den]: [110, 60, 30],
  [MinorKind.SmallCave]: [150, 150, 160],
  [MinorKind.StandingStones]: [200, 120, 255],
};
const FEATURE_OUTLINE: Rgb = [0, 0, 0];
const FEATURE_RADIUS = 2;
const DEEP_FOREST_AREA: Rgb = [8, 30, 14];
const DEEP_FOREST_TINT = 0.7;
const INDEX_CONTOUR_SHADE = 0.7;
const PROVINCE_BORDER_SHADE = 0.45;

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

const featureMarks = (point: Vec2, color: Rgb): Mark[] => [
  { point, color: FEATURE_OUTLINE, radius: FEATURE_RADIUS + 1 },
  { point, color, radius: FEATURE_RADIUS },
];

const squareAround = (radius: number): Vec2[] =>
  Array.from({ length: (2 * radius + 1) ** 2 }, (_, i) => ({
    x: (i % (2 * radius + 1)) - radius,
    y: Math.floor(i / (2 * radius + 1)) - radius,
  }));

export const markPixels = ({ radius }: Mark): Vec2[] => squareAround(radius);

const regionsWithin = (center: Vec2, radius: number) =>
  regions.cellsAround(regions.cellOf(center), Math.ceil(radius / REGION_SIZE));

const lineMarks = (lines: readonly { readonly nodes: readonly Vec2[] }[], color: Rgb): Mark[] =>
  lines.flatMap(({ nodes }) => nodes.map((point) => ({ point, color, radius: 0 })));

export const overviewFeatureMarks = (world: Worldgen, center: Vec2, radius: number): Mark[] =>
  regionsWithin(center, radius).flatMap((region) => {
    const camp = world.campAt(region);
    return [
      ...world.deepForestsIn(region).flatMap(({ layout }) => featureMarks(layout.glade, GLADE_MARK)),
      ...(camp ? featureMarks(camp, CAMP_MARK) : []),
      ...world.caveMouthsIn(region).flatMap(({ inside }) => featureMarks(inside, CAVE_MARK)),
      ...world.mineEntrancesIn(region).flatMap(({ inside }) => featureMarks(inside, MINE_MARK)),
      ...world.settlementsIn(region).flatMap(({ anchor }) => featureMarks(anchor, SETTLEMENT_MARK)),
      ...world.farmsIn(region).map(({ anchor }) => ({ point: anchor, color: FARM_MARK, radius: 1 })),
      ...world.minorsIn(region).flatMap(({ anchor }) => featureMarks(anchor, MINOR_MARKS[anchor.kind])),
    ];
  });

export const overviewMarks = (world: Worldgen, center: Vec2, radius: number): Mark[] => [
  ...regionsWithin(center, radius).flatMap((region) => [
    ...lineMarks(world.riversNear(region), RIVER_MARK),
    ...world.waysNear(region).flatMap((link) => lineMarks([link], link.way === Way.Road ? ROAD_MARK : TRAIL_MARK)),
  ]),
  ...overviewFeatureMarks(world, center, radius),
];

const nearestOf = (seats: readonly Vec2[]) => (p: Vec2) => {
  let nearest = seats[0];
  let best = Infinity;
  for (const seat of seats) {
    const gap = (seat.x - p.x) ** 2 + (seat.y - p.y) ** 2;
    if (gap < best) [nearest, best] = [seat, gap];
  }
  return nearest;
};

export const overviewImage = (world: Worldgen, mode: HeightMode, frame: MapFrame): Pixels => {
  const { center, size, scale } = frame;
  const radius = (size * scale) / 2;
  const forests = regionsWithin(center, radius).flatMap(world.deepForestsIn);
  const provinceOf = nearestOf(world.provincesAround(center));
  const pixels = createPixels(size);
  let north: { readonly level: number; readonly province: Vec2 | undefined }[] = [];
  for (let row = 0; row < size; row++) {
    const here: typeof north = [];
    for (let col = 0; col < size; col++) {
      const p = pointAt(frame, col, row);
      const conditions = world.fields.conditions(p.x, p.y);
      const own = { level: heightLevel(conditions.elevation), province: provinceOf(p) };
      const [west, above] = [here[col - 1] ?? own, north[col] ?? own];
      here.push(own);
      const color = fieldColor(mode, conditions, { westLevel: west.level, northLevel: above.level, spacing: scale });
      const forested = forests.some(({ bounds, layout }) => contains(bounds, p) && layout.contains(p));
      const tinted = forested ? mix(color, DEEP_FOREST_AREA, DEEP_FOREST_TINT) : color;
      const onBorder = west.province !== own.province || above.province !== own.province;
      pixels.set(col, row, onBorder ? shade(tinted, PROVINCE_BORDER_SHADE) : tinted);
    }
    north = here;
  }
  for (const mark of overviewMarks(world, center, radius)) {
    const { col, row } = pixelOf(frame, mark.point);
    for (const o of markPixels(mark)) pixels.set(col + o.x, row + o.y, mark.color);
  }
  return pixels.data;
};
