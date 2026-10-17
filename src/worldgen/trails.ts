import type { Point } from "../lib";
import { MOUNTAIN_LEVEL } from "./biome";
import { REGION_SIZE, heightLevel } from "./constants";
import type { Fields } from "./fields";
import type { Region } from "./region";

export interface Trail {
  readonly nodes: readonly Point[];
}

export interface Glade extends Point {
  readonly radius: number;
}

export interface Peak extends Point {
  readonly level: number;
}

const PROBE = 16;
const PROBES_PER_SIDE = REGION_SIZE / PROBE;

const probesIn = ({ rx, ry }: Region): Point[] =>
  Array.from({ length: PROBES_PER_SIDE * PROBES_PER_SIDE }, (_, i) => ({
    x: rx * REGION_SIZE + (i % PROBES_PER_SIDE) * PROBE + PROBE / 2,
    y: ry * REGION_SIZE + Math.floor(i / PROBES_PER_SIDE) * PROBE + PROBE / 2,
  }));

export const findPeak = (fields: Fields, region: Region): Peak | undefined => {
  const peak = probesIn(region)
    .map((p) => ({ ...p, level: heightLevel(fields.elevation(p.x, p.y)) }))
    .reduce((best, p) => (p.level > best.level ? p : best));
  return peak.level >= MOUNTAIN_LEVEL ? peak : undefined;
};
