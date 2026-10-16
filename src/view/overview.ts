import type { Point } from "../lib";
import { Biome, MACRO_SIZE, Water, type Worldgen, biomeOf, heightLevel } from "../worldgen";
import { type HeightMode, type Rgb, biomeColor, surfaceColor, waterColor } from "./palette";

export interface Mark {
  readonly point: Point;
  readonly color: Rgb;
}

const RIVER_MARK: Rgb = [70, 140, 230];
const ROAD_MARK: Rgb = [120, 70, 30];
const TRAIL_MARK: Rgb = [235, 215, 160];
const CAMP_MARK: Rgb = [0, 0, 0];

export const fieldColor = (world: Worldgen, mode: HeightMode, x: number, y: number): Rgb => {
  const climate = world.fields.climate(x, y);
  const biome = biomeOf(climate);
  return biome === Biome.Ocean
    ? waterColor[Water.Deep]
    : surfaceColor(mode, biomeColor[biome], heightLevel(climate.elevation));
};

export const overviewMarks = (world: Worldgen, center: Point, radius: number): Mark[] => {
  const span = Math.ceil(radius / MACRO_SIZE);
  const middle = world.cellOf(center);
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
