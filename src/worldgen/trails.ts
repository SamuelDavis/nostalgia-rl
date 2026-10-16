import { type Point, createNoise, hash, hashString, intBetween, unit } from "../lib";
import { MOUNTAIN_LEVEL, biomeOf } from "./biome";
import { MACRO_SIZE, SEA_LEVEL, heightLevel } from "./constants";
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

const SALT = hashString("trails");
const PROBE = 16;
const PROBES_PER_SIDE = MACRO_SIZE / PROBE;
const MIN_FOREST_PROBES = 48;
const STEP = 4;
const MAX_STEPS = 40;
const EXIT_STEPS = 3;
const BRANCH_CHANCE = 0.07;
const MEANDER_SCALE = 50;
const MEANDER = 0.2;
const SPREAD_JITTER = 0.5;
const BRANCH_TURN = 1.4;

const SPREADS: Record<number, readonly (readonly [cos: number, sin: number])[]> = {
  2: [
    [1, 0],
    [-1, 0],
  ],
  3: [
    [1, 0],
    [-0.5, Math.sqrt(3) / 2],
    [-0.5, -Math.sqrt(3) / 2],
  ],
  4: [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ],
};

const normalize = (x: number, y: number): Point => {
  const length = Math.sqrt(x * x + y * y);
  return length === 0 ? { x: 1, y: 0 } : { x: x / length, y: y / length };
};

const rotate = (p: Point, cos: number, sin: number): Point => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });

const turn = (heading: Point, amount: number): Point =>
  normalize(heading.x - heading.y * amount, heading.y + heading.x * amount);

const probesIn = (cx: number, cy: number): Point[] =>
  Array.from({ length: PROBES_PER_SIDE * PROBES_PER_SIDE }, (_, i) => ({
    x: cx * MACRO_SIZE + (i % PROBES_PER_SIDE) * PROBE + PROBE / 2,
    y: cy * MACRO_SIZE + Math.floor(i / PROBES_PER_SIDE) * PROBE + PROBE / 2,
  }));

export const findPeak = (fields: Fields, cx: number, cy: number): Peak | undefined => {
  const peak = probesIn(cx, cy)
    .map((p) => ({ ...p, level: heightLevel(fields.elevation(p.x, p.y)) }))
    .reduce((best, p) => (p.level > best.level ? p : best));
  return peak.level >= MOUNTAIN_LEVEL ? peak : undefined;
};

export const traceForestTrails = (
  seed: number,
  fields: Fields,
  cx: number,
  cy: number,
): { readonly glade: Glade; readonly trails: readonly Trail[] } | undefined => {
  const isForest = (p: Point) => biomeOf(fields.climate(p.x, p.y)) === Biome.Forest;
  const forest = probesIn(cx, cy).filter(isForest);
  if (forest.length < MIN_FOREST_PROBES) return undefined;
  const interior = forest.filter((p) =>
    [
      [PROBE, 0],
      [-PROBE, 0],
      [0, PROBE],
      [0, -PROBE],
    ].every(([dx, dy]) => isForest({ x: p.x + dx!, y: p.y + dy! })),
  );
  const site = interior[intBetween(0, interior.length - 1, hash(seed, SALT, cx, cy))];
  if (!site) return undefined;

  const meander = createNoise(seed, SALT);
  const roll = (...keys: number[]) => unit(hash(seed, SALT, cx, cy, ...keys));
  const trails: Trail[] = [];

  const walk = (start: Point, initial: Point, maxSteps: number, id: number, isBranch: boolean): void => {
    const nodes: Point[] = [start];
    let position = start;
    let heading = initial;
    let outside = 0;
    for (let step = 1; step <= maxSteps; step++) {
      heading = turn(heading, meander(position.x / MEANDER_SCALE, position.y / MEANDER_SCALE) * MEANDER);
      position = { x: position.x + heading.x * STEP, y: position.y + heading.y * STEP };
      if (heightLevel(fields.elevation(position.x, position.y)) < SEA_LEVEL) break;
      nodes.push(position);
      outside = isForest(position) ? 0 : outside + 1;
      if (outside > EXIT_STEPS) break;
      if (!isBranch && roll(id, step, 1) < BRANCH_CHANCE) {
        const side = roll(id, step, 2) < 0.5 ? -1 : 1;
        walk(position, turn(heading, side * BRANCH_TURN), maxSteps >> 1, id * 100 + step, true);
      }
    }
    trails.push({ nodes });
  };

  const spread = SPREADS[intBetween(2, 4, hash(seed, SALT, cx, cy, 1))]!;
  const base = normalize(roll(2) - 0.5, roll(3) - 0.5);
  spread.forEach(([cos, sin], i) => {
    const heading = turn(rotate(base, cos, sin), (roll(4, i) - 0.5) * SPREAD_JITTER);
    walk(site, heading, MAX_STEPS, i + 1, false);
  });

  return { glade: { ...site, radius: intBetween(4, 7, hash(seed, SALT, cx, cy, 5)) }, trails };
};
