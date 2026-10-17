import { type Point, hash, hashString, intBetween } from "../lib";
import { MOUNTAIN_LEVEL, biomeOf } from "./biome";
import { REGION_SIZE, heightLevel } from "./constants";
import type { Fields } from "./fields";
import { Biome } from "./terrain";

export interface Trail {
  readonly nodes: readonly Point[];
}

export interface Glade extends Point {
  readonly radius: number;
}

export interface Peak extends Point {
  readonly level: number;
}

const SALT = hashString("glades");
const PROBE = 16;
const PROBES_PER_SIDE = REGION_SIZE / PROBE;
const MIN_FOREST_PROBES = 48;
const PROBE_NEIGHBOURS: readonly Point[] = [
  { x: PROBE, y: 0 },
  { x: -PROBE, y: 0 },
  { x: 0, y: PROBE },
  { x: 0, y: -PROBE },
];

const probesIn = (cx: number, cy: number): Point[] =>
  Array.from({ length: PROBES_PER_SIDE * PROBES_PER_SIDE }, (_, i) => ({
    x: cx * REGION_SIZE + (i % PROBES_PER_SIDE) * PROBE + PROBE / 2,
    y: cy * REGION_SIZE + Math.floor(i / PROBES_PER_SIDE) * PROBE + PROBE / 2,
  }));

export const findPeak = (fields: Fields, cx: number, cy: number): Peak | undefined => {
  const peak = probesIn(cx, cy)
    .map((p) => ({ ...p, level: heightLevel(fields.elevation(p.x, p.y)) }))
    .reduce((best, p) => (p.level > best.level ? p : best));
  return peak.level >= MOUNTAIN_LEVEL ? peak : undefined;
};

export const findGlade = (seed: number, fields: Fields, cx: number, cy: number): Glade | undefined => {
  const isForest = (p: Point) => biomeOf(fields.conditions(p.x, p.y)) === Biome.Forest;
  const forest = probesIn(cx, cy).filter(isForest);
  if (forest.length < MIN_FOREST_PROBES) return undefined;
  const interior = forest.filter((p) => PROBE_NEIGHBOURS.every((o) => isForest({ x: p.x + o.x, y: p.y + o.y })));
  const site = interior[intBetween(0, interior.length - 1, hash(seed, SALT, cx, cy))];
  return site && { ...site, radius: intBetween(4, 7, hash(seed, SALT, cx, cy, 1)) };
};
