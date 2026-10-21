import { type Reader, type Stage, type Vec2, boundsOf, clamp, distance, rngOf, stage } from "procgen";
import { heightLevel } from "../constants";
import type { Fields } from "../fields";
import { regions } from "../region";
import { CEILING, FLOOR_SPACING, type CavePlan, type LevelledTile, RAMP_GAP, cardinalOf, stepsFrom } from "./plan";
import { type Cave, type CaveSiting, TERRITORY_RADIUS } from "./siting";

export interface Junction {
  readonly floor: number;
  readonly tiles: readonly LevelledTile[];
  readonly across: Vec2;
  readonly other: { readonly cave: Cave; readonly floor: number };
}

export interface JunctionInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly siting: CaveSiting;
  readonly plans: Stage<readonly CavePlan[]>;
}

const JUNCTION_CHANCE = 0.7;
const SLOPE_LENGTH = 12;
const BORDER_SHIFTS = [0, 8, -8, 16, -16, 24, -24];
const NEIGHBOUR_REACH = 2 * TERRITORY_RADIUS;
const OWNER_REACH = NEIGHBOUR_REACH + TERRITORY_RADIUS + 48;

const planFor = (reader: Reader, plans: Stage<readonly CavePlan[]>, cave: Cave): CavePlan =>
  reader.read(plans, cave.region).find((plan) => plan.cave.id === cave.id)!;

export const createJunctions = ({ seed, fields, siting, plans }: JunctionInput) => {
  const rng = rngOf(seed, "cave junctions");
  const level = (p: Vec2) => heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5));

  const featuresOf = ({ top, bottom, mouth, rampBelow }: CavePlan, floor: number): Vec2[] => [
    ...(floor > bottom ? (rampBelow(floor)?.tiles ?? []) : []),
    ...(floor < top ? (rampBelow(floor + 1)?.tiles ?? []) : []),
    ...(floor === 0 ? mouth.passage : []),
  ];

  const between = (reader: Reader, a: CavePlan, b: CavePlan) => {
    const sideOf = (
      plan: CavePlan,
      floor: number,
      border: Vec2,
      inward: Vec2,
      meeting: number,
    ): Junction["tiles"] | undefined => {
      const base = plan.baseOf(floor);
      const tiles = stepsFrom(border, inward, SLOPE_LENGTH).map((p, i) => ({
        ...p,
        level: meeting + Math.round(((base - meeting) * i) / (SLOPE_LENGTH - 1)),
      }));
      const features = featuresOf(plan, floor);
      const fits = tiles.every(
        (t) =>
          siting.caveOwning(reader, t)?.id === plan.cave.id &&
          level(t) >= t.level + CEILING &&
          features.every((f) => distance(f, t) > RAMP_GAP),
      );
      return fits ? tiles : undefined;
    };

    const pair = rng.child(a.cave.id, b.cave.id);
    if (!pair.chance(JUNCTION_CHANCE, 0)) return undefined;
    const low = Math.max(a.baseOf(a.bottom), b.baseOf(b.bottom));
    const high = Math.min(a.baseOf(a.top), b.baseOf(b.top));
    if (low > high) return undefined;
    const floorNear = (plan: CavePlan, target: number) =>
      clamp(Math.round((target - plan.mouth.level) / FLOOR_SPACING), plan.bottom, plan.top);
    const toward = cardinalOf({ x: b.cave.x - a.cave.x, y: b.cave.y - a.cave.y });
    const across = { x: -toward.y, y: toward.x };
    const midpoint = { x: Math.floor((a.cave.x + b.cave.x) / 2), y: Math.floor((a.cave.y + b.cave.y) / 2) };
    const targets = Array.from(
      { length: Math.floor((high - low) / FLOOR_SPACING) + 1 },
      (_, i) => low + i * FLOOR_SPACING,
    )
      .map((target) => ({ target, order: pair.u32(target) }))
      .sort((x, y) => x.order - y.order);
    for (const { target } of targets)
      for (const shift of BORDER_SHIFTS) {
        const [floorA, floorB] = [floorNear(a, target), floorNear(b, target)];
        const meeting = Math.round((a.baseOf(floorA) + b.baseOf(floorB)) / 2);
        const borderA = { x: midpoint.x + across.x * shift, y: midpoint.y + across.y * shift };
        const borderB = { x: borderA.x + toward.x, y: borderA.y + toward.y };
        const tilesA = sideOf(a, floorA, borderA, { x: -toward.x, y: -toward.y }, meeting);
        const tilesB = tilesA && sideOf(b, floorB, borderB, toward, meeting);
        if (tilesA && tilesB)
          return {
            a: { floor: floorA, tiles: tilesA, across: borderB, other: { cave: b.cave, floor: floorB } },
            b: { floor: floorB, tiles: tilesB, across: borderA, other: { cave: a.cave, floor: floorA } },
          };
      }
    return undefined;
  };

  const junctionsOf = (reader: Reader, plan: CavePlan): Junction[] =>
    reader
      .gather(siting.caves, boundsOf([plan.cave], NEIGHBOUR_REACH))
      .filter((other) => other.id !== plan.cave.id && distance(plan.cave, other) <= NEIGHBOUR_REACH)
      .flatMap((other) => {
        const otherPlan = planFor(reader, plans, other);
        const isFirst = plan.cave.id < other.id;
        const junction = isFirst ? between(reader, plan, otherPlan) : between(reader, otherPlan, plan);
        return junction ? [isFirst ? junction.a : junction.b] : [];
      });

  return stage({
    name: "cave junctions",
    grid: regions,
    reads: [
      { stage: plans, radius: NEIGHBOUR_REACH },
      { stage: siting.caves, radius: OWNER_REACH },
    ],
    compute: (region, context): readonly (readonly Junction[])[] =>
      context.read(plans, region).map((plan) => junctionsOf(context, plan)),
  });
};
