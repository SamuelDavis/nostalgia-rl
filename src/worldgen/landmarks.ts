import { type Cell, type Vec2, stage } from "procgen";
import { MOUNTAIN_LEVEL } from "./biome";
import { REGION_SIZE, heightLevel } from "./constants";
import type { Fields } from "./fields";
import { regions } from "./region";

export interface Glade extends Vec2 {
  readonly radius: number;
}

export interface Peak extends Vec2 {
  readonly level: number;
}

const PROBE = 16;
const PROBES_PER_SIDE = REGION_SIZE / PROBE;

const probesIn = ({ col, row }: Cell): Vec2[] =>
  Array.from({ length: PROBES_PER_SIDE * PROBES_PER_SIDE }, (_, i) => ({
    x: col * REGION_SIZE + (i % PROBES_PER_SIDE) * PROBE + PROBE / 2,
    y: row * REGION_SIZE + Math.floor(i / PROBES_PER_SIDE) * PROBE + PROBE / 2,
  }));

export const findPeak = (fields: Fields, region: Cell): Peak | undefined => {
  const peak = probesIn(region)
    .map((p) => ({ ...p, level: heightLevel(fields.elevation(p.x, p.y)) }))
    .reduce((best, p) => (p.level > best.level ? p : best));
  return peak.level >= MOUNTAIN_LEVEL ? peak : undefined;
};

export const createPeaks = (fields: Fields) =>
  stage({ name: "peaks", grid: regions, compute: (region) => findPeak(fields, region) });
