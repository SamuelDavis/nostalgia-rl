import type { Point } from "../lib";
import { Biome, type Climate, REGION_SIZE, Water, type Worldgen, biomeOf, heightLevel } from "../worldgen";
import {
  type HeightMode,
  type Rgb,
  biomeColor,
  contourBetween,
  hillshade,
  shade,
  surfaceColor,
  waterColor,
} from "./palette";

export interface Mark {
  readonly point: Point;
  readonly color: Rgb;
}

const RIVER_MARK: Rgb = [70, 140, 230];
const ROAD_MARK: Rgb = [120, 70, 30];
const TRAIL_MARK: Rgb = [235, 215, 160];
const CAMP_MARK: Rgb = [0, 0, 0];
const INDEX_CONTOUR_SHADE = 0.7;

export interface FieldNeighbours {
  readonly westLevel: number;
  readonly northLevel: number;
  readonly spacing: number;
}

export const fieldColor = (
  mode: HeightMode,
  climate: Climate,
  { westLevel, northLevel, spacing }: FieldNeighbours,
): Rgb => {
  const biome = biomeOf(climate);
  if (biome === Biome.Ocean) return waterColor[Water.Deep];
  const level = heightLevel(climate.elevation);
  const light = hillshade((level - westLevel) / spacing, (level - northLevel) / spacing);
  const color = surfaceColor(mode, biomeColor[biome], level, light);
  const onIndex = contourBetween(level, westLevel) === "index" || contourBetween(level, northLevel) === "index";
  return onIndex ? shade(color, INDEX_CONTOUR_SHADE) : color;
};

export const overviewMarks = (world: Worldgen, center: Point, radius: number): Mark[] => {
  const span = Math.ceil(radius / REGION_SIZE);
  const middle = world.regionOf(center);
  const marks: Mark[] = [];
  for (let cy = middle.cy - span; cy <= middle.cy + span; cy++)
    for (let cx = middle.cx - span; cx <= middle.cx + span; cx++) {
      for (const river of world.riversNear(cx, cy))
        for (const point of river.nodes) marks.push({ point, color: RIVER_MARK });
      for (const trail of world.trailsNear(cx, cy))
        for (const point of trail.nodes) marks.push({ point, color: TRAIL_MARK });
      for (const road of world.roadsFrom(cx, cy))
        for (const point of road.nodes) marks.push({ point, color: ROAD_MARK });
      const camp = world.campAt(cx, cy);
      if (camp) marks.push({ point: camp, color: CAMP_MARK });
    }
  return marks;
};
