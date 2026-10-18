import { type Point, countBiasedLow, distance, hash, hashString, intBetween, memoize } from "../../lib";
import { MOUNTAIN_LEVEL } from "../biome";
import { heightLevel, metresToLevels } from "../constants";
import type { Fields } from "../fields";
import { type Cave, TERRITORY_RADIUS } from "./siting";

export interface LevelledTile extends Point {
  readonly level: number;
}

export interface Mouth {
  readonly outside: Point;
  readonly inside: Point;
  readonly passage: readonly Point[];
  readonly level: number;
}

export interface Ramp {
  readonly tiles: readonly LevelledTile[];
}

export interface CavePlan {
  readonly cave: Cave;
  readonly mouth: Mouth;
  readonly top: number;
  readonly bottom: number;
  readonly baseOf: (floor: number) => number;
}

export interface CavePlanInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly caveOwning: (p: Point) => Cave | undefined;
}

export const FLOOR_SPACING = metresToLevels(8);
export const CEILING = metresToLevels(5);
export const RAMP_LENGTH = 24;
export const RAMP_LINK = RAMP_LENGTH / 2;

const SALT = hashString("cave plans");
const PASSAGE_LENGTH = 8;
const MOUTH_REACH = TERRITORY_RADIUS - PASSAGE_LENGTH;
const MAX_FLOORS_BELOW = 8;
const RAMP_TRIES = 32;
const RAMP_REACH = Math.round(TERRITORY_RADIUS * 0.7);
const RAMP_GAP = 4;
const CACHE = 1024;

const CARDINALS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

const cardinalOf = (d: Point): Point =>
  Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x), y: 0 } : { x: 0, y: Math.sign(d.y) };

const stepsFrom = (from: Point, step: Point, count: number): Point[] =>
  Array.from({ length: count }, (_, i) => ({ x: from.x + step.x * i, y: from.y + step.y * i }));

export const createCavePlans = ({ seed, fields, caveOwning }: CavePlanInput) => {
  const level = (p: Point) => heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5));
  const isOwnedBy = (cave: Cave, p: Point) => caveOwning(p)?.id === cave.id;

  const mouthOf = (cave: Cave): Mouth => {
    const target = intBetween(
      MOUNTAIN_LEVEL,
      Math.max(MOUNTAIN_LEVEL, cave.level - 2 * FLOOR_SPACING),
      hash(cave.id, 1),
    );
    const start = hash(cave.id, 2) % DIRECTIONS.length;
    const attempts = DIRECTIONS.map((_, i) => {
      const direction = DIRECTIONS[(start + i) % DIRECTIONS.length]!;
      const outward = cardinalOf(direction);
      let reach = PASSAGE_LENGTH;
      const tileAt = (r: number) => ({
        x: Math.round(cave.x + direction.x * r),
        y: Math.round(cave.y + direction.y * r),
      });
      while (reach < MOUTH_REACH && level(tileAt(reach)) > target) reach++;
      const inside = tileAt(reach);
      const outside = { x: inside.x + outward.x, y: inside.y + outward.y };
      const passage = stepsFrom(
        { x: inside.x - outward.x * PASSAGE_LENGTH, y: inside.y - outward.y * PASSAGE_LENGTH },
        outward,
        PASSAGE_LENGTH + 1,
      );
      return { inside, outside, passage, level: level(outside) };
    });
    const valid = attempts.filter((m) => m.passage.every((p) => isOwnedBy(cave, p)) && m.level < level(m.inside));
    return valid.find((m) => m.level <= target) ?? valid[0] ?? attempts.reduce((a, b) => (b.level < a.level ? b : a));
  };

  const rampFrom = (start: Point, outward: Point, upper: number, lower: number): Ramp => ({
    tiles: stepsFrom(start, outward, RAMP_LENGTH).map((p, i) => ({
      ...p,
      level: upper - Math.round(((upper - lower) * i) / (RAMP_LENGTH - 1)),
    })),
  });

  let planOf: (cave: Cave) => CavePlan;

  const rampBelow = memoize(
    ({ cave, floor }: { cave: Cave; floor: number }): Ramp | undefined => {
      const { baseOf } = planOf(cave);
      for (let i = 0; i < RAMP_TRIES; i++) {
        const h = hash(seed, SALT, cave.id, floor, i);
        const start = {
          x: cave.x + intBetween(-RAMP_REACH, RAMP_REACH, hash(h, 1)),
          y: cave.y + intBetween(-RAMP_REACH, RAMP_REACH, hash(h, 2)),
        };
        const ramp = rampFrom(start, CARDINALS[hash(h, 3) % CARDINALS.length]!, baseOf(floor), baseOf(floor - 1));
        const fits = ramp.tiles.every((t) => isOwnedBy(cave, t) && level(t) >= t.level + CEILING);
        if (fits && !isNearRampOrMouth(cave, floor, ramp)) return ramp;
      }
      return undefined;
    },
    ({ cave, floor }) => `${cave.id}:${floor}`,
    CACHE,
  );

  const isNearRampOrMouth = (cave: Cave, floor: number, ramp: Ramp): boolean => {
    const plan = planOf(cave);
    const others = [
      ...(floor + 1 <= plan.top ? (rampBelow({ cave, floor: floor + 1 })?.tiles ?? []) : []),
      ...(floor === 0 || floor - 1 === 0 ? plan.mouth.passage : []),
    ];
    return ramp.tiles.some((t) => others.some((o) => distance(t, o) <= RAMP_GAP));
  };

  planOf = memoize(
    (cave: Cave): CavePlan => {
      const mouth = mouthOf(cave);
      const baseOf = (floor: number) => mouth.level + floor * FLOOR_SPACING;
      const top = Math.max(0, Math.floor((cave.level - CEILING - mouth.level) / FLOOR_SPACING) - 1);
      return { cave, mouth, top, bottom: -countBiasedLow(MAX_FLOORS_BELOW, hash(cave.id, 3)), baseOf };
    },
    (cave) => String(cave.id),
    CACHE,
  );

  const reachablePlanOf = memoize(
    (cave: Cave): CavePlan => {
      const plan = planOf(cave);
      let top = 0;
      while (top < plan.top && rampBelow({ cave, floor: top + 1 })) top++;
      let bottom = 0;
      while (bottom > plan.bottom && rampBelow({ cave, floor: bottom })) bottom--;
      return { ...plan, top, bottom };
    },
    (cave) => String(cave.id),
    CACHE,
  );

  return {
    planOf: reachablePlanOf,
    rampBelow: (cave: Cave, floor: number) => rampBelow({ cave, floor }),
  };
};
