import { type Dependency, type Reader, type Vec2, clamp, distance, inverseLerp, rngOf, stage } from "procgen";
import { fewerMoreLikely } from "../../counts";
import { MOUNTAIN_LEVEL } from "../../biome";
import { heightLevel, metresToLevels } from "../../constants";
import type { Fields } from "../../fields";
import { regions } from "../../region";
import { type Cave, type CaveSiting, TERRITORY_RADIUS } from "./siting";

export interface LevelledTile extends Vec2 {
  readonly level: number;
}

export interface Mouth {
  readonly outside: Vec2;
  readonly inside: Vec2;
  readonly passage: readonly Vec2[];
  readonly level: number;
}

export interface Ramp {
  readonly tiles: readonly LevelledTile[];
  readonly link: number;
}

export interface FloorRange {
  readonly top: number;
  readonly bottom: number;
}

export interface CavePlan extends FloorRange {
  readonly cave: Cave;
  readonly mouth: Mouth;
  readonly mine: FloorRange | undefined;
  readonly baseOf: (floor: number) => number;
  readonly rampBelow: (floor: number) => Ramp | undefined;
}

export interface CavePlanInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly siting: CaveSiting;
  readonly waynessAt: (reader: Reader, p: Vec2) => number;
  readonly waynessReads: readonly Dependency[];
}

export const FLOOR_SPACING = metresToLevels(8);
export const CEILING = metresToLevels(5);
export const RAMP_LENGTH = 24;

const PASSAGE_LENGTH = 8;
const MOUTH_REACH = TERRITORY_RADIUS - PASSAGE_LENGTH;
const MAX_FLOORS_BELOW = 8;
const RAMP_TRIES = 32;
const RAMP_REACH = Math.round(TERRITORY_RADIUS * 0.7);
export const RAMP_GAP = 4;
const MINE_CHANCE = 0.75;
const EMPTY_WAYNESS = 0.2;
const BUSY_WAYNESS = 0.5;
const MAX_MINE_FLOORS_BELOW = 6;
const MAX_MINE_FLOORS_ABOVE = 3;
const OWNER_REACH = 2 * TERRITORY_RADIUS + 32;

const CARDINALS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const DIRECTIONS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

export const cardinalOf = (d: Vec2): Vec2 =>
  Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x), y: 0 } : { x: 0, y: Math.sign(d.y) };

export const stepsFrom = (from: Vec2, step: Vec2, count: number): Vec2[] =>
  Array.from({ length: count }, (_, i) => ({ x: from.x + step.x * i, y: from.y + step.y * i }));

export const isOnFloors = ({ top, bottom }: FloorRange, floor: number) => floor <= top && floor >= bottom;

export const rampFrom = (start: Vec2, outward: Vec2, upper: number, lower: number, length: number): Ramp => ({
  tiles: stepsFrom(start, outward, length).map((p, i) => ({
    ...p,
    level: upper - Math.round(((upper - lower) * i) / (length - 1)),
  })),
  link: Math.floor(length / 2),
});

export const createCavePlans = ({ seed, fields, siting, waynessAt, waynessReads }: CavePlanInput) => {
  const rng = rngOf(seed, "cave plans");
  const level = (p: Vec2) => heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5));

  const mouthOf = (cave: Cave, isOwned: (p: Vec2) => boolean): Mouth => {
    const target = rng.int(MOUNTAIN_LEVEL, Math.max(MOUNTAIN_LEVEL, cave.level - 2 * FLOOR_SPACING), cave.id, 1);
    const start = rng.u32(cave.id, 2) % DIRECTIONS.length;
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
    const valid = attempts.filter((m) => m.passage.every(isOwned) && m.level < level(m.inside));
    return valid.find((m) => m.level <= target) ?? valid[0] ?? attempts.reduce((a, b) => (b.level < a.level ? b : a));
  };

  const planOf = (cave: Cave, reader: Reader): CavePlan => {
    const isOwned = (p: Vec2) => siting.caveOwning(reader, p)?.id === cave.id;
    const mouth = mouthOf(cave, isOwned);
    const busyness = clamp(inverseLerp(EMPTY_WAYNESS, BUSY_WAYNESS, waynessAt(reader, mouth.outside)), 0, 1);
    const isMine = rng.chance(MINE_CHANCE * busyness, cave.id, 4);
    const baseOf = (floor: number) => mouth.level + floor * FLOOR_SPACING;
    const naturalTop = Math.max(0, Math.floor((cave.level - CEILING - mouth.level) / FLOOR_SPACING) - 1);
    const naturalBottom = -rng.weighted(fewerMoreLikely(MAX_FLOORS_BELOW), cave.id, 3);

    const ramps = new Map<number, Ramp | undefined>();
    const isNearRampOrMouth = (floor: number, ramp: Ramp): boolean => {
      const others = [
        ...(floor + 1 <= naturalTop ? (rampBelow(floor + 1)?.tiles ?? []) : []),
        ...(floor === 0 || floor - 1 === 0 ? mouth.passage : []),
      ];
      return ramp.tiles.some((t) => others.some((o) => distance(t, o) <= RAMP_GAP));
    };
    const findRamp = (floor: number): Ramp | undefined => {
      for (let i = 0; i < RAMP_TRIES; i++) {
        const attempt = rng.child(cave.id, floor, i);
        const start = {
          x: cave.x + attempt.int(-RAMP_REACH, RAMP_REACH, 1),
          y: cave.y + attempt.int(-RAMP_REACH, RAMP_REACH, 2),
        };
        const outward = attempt.pick(CARDINALS, 3);
        const ramp = rampFrom(start, outward, baseOf(floor), baseOf(floor - 1), RAMP_LENGTH);
        const fits = ramp.tiles.every((t) => isOwned(t) && level(t) >= t.level + CEILING);
        if (fits && !isNearRampOrMouth(floor, ramp)) return ramp;
      }
      return undefined;
    };
    const rampBelow = (floor: number): Ramp | undefined => {
      if (!ramps.has(floor)) ramps.set(floor, findRamp(floor));
      return ramps.get(floor);
    };

    let top = 0;
    while (top < naturalTop && rampBelow(top + 1)) top++;
    let bottom = 0;
    while (bottom > naturalBottom && rampBelow(bottom)) bottom--;
    const mine = isMine
      ? {
          top: Math.min(naturalTop, top + rng.weighted(fewerMoreLikely(MAX_MINE_FLOORS_ABOVE), cave.id, 5)),
          bottom: bottom - rng.weighted(fewerMoreLikely(MAX_MINE_FLOORS_BELOW), cave.id, 6),
        }
      : undefined;
    const reachable = new Map([...ramps].filter(([floor]) => floor > bottom && floor <= top));
    return { cave, mouth, top, bottom, mine, baseOf, rampBelow: (floor) => reachable.get(floor) };
  };

  return stage({
    name: "cave plans",
    grid: regions,
    reads: [{ stage: siting.caves, radius: OWNER_REACH }, ...waynessReads],
    compute: (region, context): readonly CavePlan[] =>
      context.read(siting.caves, region).map((cave) => planOf(cave, context)),
  });
};
