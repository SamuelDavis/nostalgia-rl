import { type Point, clamp, distance, hash, hashString, memoize, unit } from "../../lib";
import { heightLevel } from "../constants";
import type { Fields } from "../fields";
import { regionsAround } from "../region";
import {
  CEILING,
  FLOOR_SPACING,
  type LevelledTile,
  RAMP_GAP,
  cardinalOf,
  type createCavePlans,
  stepsFrom,
} from "./plan";
import { type Cave, TERRITORY_RADIUS, type createCaveSiting } from "./siting";

export interface Junction {
  readonly floor: number;
  readonly tiles: readonly LevelledTile[];
  readonly across: Point;
  readonly other: { readonly cave: Cave; readonly floor: number };
}

export interface JunctionInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly siting: ReturnType<typeof createCaveSiting>;
  readonly plans: ReturnType<typeof createCavePlans>;
}

const SALT = hashString("cave junctions");
const JUNCTION_CHANCE = 0.7;
const SLOPE_LENGTH = 12;
const BORDER_SHIFTS = [0, 8, -8, 16, -16, 24, -24];
const CACHE = 4096;

export const createJunctions = ({ seed, fields, siting, plans }: JunctionInput) => {
  const level = (p: Point) => heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5));

  const featuresOf = (cave: Cave, floor: number): Point[] => {
    const { top, bottom, mouth } = plans.planOf(cave);
    return [
      ...(floor > bottom ? (plans.rampBelow(cave, floor)?.tiles ?? []) : []),
      ...(floor < top ? (plans.rampBelow(cave, floor + 1)?.tiles ?? []) : []),
      ...(floor === 0 ? mouth.passage : []),
    ];
  };

  const sideOf = (
    cave: Cave,
    floor: number,
    border: Point,
    inward: Point,
    meeting: number,
  ): Junction["tiles"] | undefined => {
    const base = plans.planOf(cave).baseOf(floor);
    const tiles = stepsFrom(border, inward, SLOPE_LENGTH).map((p, i) => ({
      ...p,
      level: meeting + Math.round(((base - meeting) * i) / (SLOPE_LENGTH - 1)),
    }));
    const features = featuresOf(cave, floor);
    const fits = tiles.every(
      (t) =>
        siting.caveOwning(t)?.id === cave.id &&
        level(t) >= t.level + CEILING &&
        features.every((f) => distance(f, t) > RAMP_GAP),
    );
    return fits ? tiles : undefined;
  };

  const between = memoize(
    ([a, b]: readonly [Cave, Cave]) => {
      const h = hash(seed, SALT, a.id, b.id);
      if (unit(h) >= JUNCTION_CHANCE) return undefined;
      const [planA, planB] = [plans.planOf(a), plans.planOf(b)];
      const low = Math.max(planA.baseOf(planA.bottom), planB.baseOf(planB.bottom));
      const high = Math.min(planA.baseOf(planA.top), planB.baseOf(planB.top));
      if (low > high) return undefined;
      const floorNear = (plan: typeof planA, target: number) =>
        clamp(Math.round((target - plan.mouth.level) / FLOOR_SPACING), plan.bottom, plan.top);
      const toward = cardinalOf({ x: b.x - a.x, y: b.y - a.y });
      const across = { x: -toward.y, y: toward.x };
      const midpoint = { x: Math.floor((a.x + b.x) / 2), y: Math.floor((a.y + b.y) / 2) };
      const targets = Array.from(
        { length: Math.floor((high - low) / FLOOR_SPACING) + 1 },
        (_, i) => low + i * FLOOR_SPACING,
      )
        .map((target) => ({ target, order: hash(h, target) }))
        .sort((x, y) => x.order - y.order);
      for (const { target } of targets)
        for (const shift of BORDER_SHIFTS) {
          const [floorA, floorB] = [floorNear(planA, target), floorNear(planB, target)];
          const meeting = Math.round((planA.baseOf(floorA) + planB.baseOf(floorB)) / 2);
          const borderA = { x: midpoint.x + across.x * shift, y: midpoint.y + across.y * shift };
          const borderB = { x: borderA.x + toward.x, y: borderA.y + toward.y };
          const tilesA = sideOf(a, floorA, borderA, { x: -toward.x, y: -toward.y }, meeting);
          const tilesB = tilesA && sideOf(b, floorB, borderB, toward, meeting);
          if (tilesA && tilesB)
            return {
              a: { floor: floorA, tiles: tilesA, across: borderB, other: { cave: b, floor: floorB } },
              b: { floor: floorB, tiles: tilesB, across: borderA, other: { cave: a, floor: floorA } },
            };
        }
      return undefined;
    },
    ([a, b]) => `${a.id}-${b.id}`,
    CACHE,
  );

  const junctionsOf = memoize(
    (cave: Cave): Junction[] =>
      regionsAround(cave.region, 1)
        .flatMap(siting.cavesIn)
        .filter((other) => other.id !== cave.id && distance(cave, other) <= 2 * TERRITORY_RADIUS)
        .flatMap((other) => {
          const isFirst = cave.id < other.id;
          const junction = between(isFirst ? [cave, other] : [other, cave]);
          return junction ? [isFirst ? junction.a : junction.b] : [];
        }),
    (cave) => String(cave.id),
    CACHE,
  );

  return { junctionsOf };
};
