import { describe, expect, it } from "vitest";
import { rngOf } from "procgen";
import { Prop } from "../../terrain";
import { MAX_CLIMB } from "../../constants";
import {
  BUILDING_SIZES,
  BuildingKind,
  type Plan,
  STOREY,
  STOREYS,
  cellOf,
  planBuilding,
  riseOf,
  stairTiles,
} from "./plan";

const KINDS = Object.values(BuildingKind);
const plansOf = (kind: BuildingKind) => Array.from({ length: 40 }, (_, i) => planBuilding(kind, rngOf(i, "plans")));
const floorsOf = (plan: Plan) => Array.from({ length: plan.floors.length }, (_, floor) => floor);

interface Spot {
  readonly u: number;
  readonly v: number;
}

const entriesOf = (plan: Plan, floor: number): Spot[] =>
  floor === 0
    ? plan.doors.map((u) => ({ u, v: 0 }))
    : plan.stairs.filter((stairs) => stairs.from === floor - 1).map((stairs) => stairTiles(stairs).landing);

const isOpen = (plan: Plan, floor: number, u: number, v: number) => {
  const cell = cellOf(plan, u, v, floor);
  return cell === Prop.None || cell === Prop.Door;
};

const reachable = (plan: Plan, floor: number): Set<number> => {
  const seen = new Set<number>();
  const queue = entriesOf(plan, floor);
  while (queue.length > 0) {
    const { u, v } = queue.pop()!;
    const key = v * plan.width + u;
    if (seen.has(key) || u < 0 || v < 0 || u >= plan.width || v >= plan.depth || !isOpen(plan, floor, u, v)) continue;
    seen.add(key);
    queue.push({ u: u + 1, v }, { u: u - 1, v }, { u, v: v + 1 }, { u, v: v - 1 });
  }
  return seen;
};

const ringOf = ({ width, depth }: Plan) =>
  Array.from({ length: width * depth }, (_, i) => ({ u: i % width, v: Math.floor(i / width) })).filter(
    ({ u, v }) => u === 0 || v === 0 || u === width - 1 || v === depth - 1,
  );

const heightOf = (plan: Plan, floor: number, { u, v }: Spot) => floor * STOREY + riseOf(plan, floor, u, v);

const count = (plan: Plan, prop: Prop) => plan.floors.flat().filter((cell) => cell === prop).length;

describe("buildings", () => {
  it("are sized to scale for their kind", () => {
    for (const kind of KINDS)
      for (const plan of plansOf(kind)) {
        const { width, depth } = BUILDING_SIZES[kind];
        expect(plan.width).toBeGreaterThanOrEqual(width[0]);
        expect(plan.width).toBeLessThanOrEqual(width[1]);
        expect(plan.depth).toBeGreaterThanOrEqual(depth[0]);
        expect(plan.depth).toBeLessThanOrEqual(depth[1]);
      }
  });

  it("are walled all round but for doors in the ground floor's front wall, away from its corners", () => {
    for (const kind of KINDS)
      for (const plan of plansOf(kind)) {
        expect(plan.doors.length).toBeGreaterThan(0);
        for (const floor of floorsOf(plan))
          for (const { u, v } of ringOf(plan)) {
            const isDoor = floor === 0 && v === 0 && plan.doors.includes(u);
            expect(cellOf(plan, u, v, floor), `${kind} ${u},${v} floor ${floor}`).toBe(isDoor ? Prop.Door : Prop.Wall);
          }
        for (const u of plan.doors) expect(u > 1 && u < plan.width - 2).toBe(true);
      }
  });

  it("leave every floor tile on every floor reachable from the door or the stairs", () => {
    for (const kind of KINDS)
      for (const plan of plansOf(kind))
        for (const floor of floorsOf(plan)) {
          const reached = reachable(plan, floor);
          plan.floors[floor]!.forEach((cell, i) => {
            const at = `${kind} floor ${floor} at ${i % plan.width},${Math.floor(i / plan.width)}`;
            if (cell === Prop.None) expect(reached.has(i), at).toBe(true);
          });
        }
  });

  it("rise to as many storeys as their kind has, each joined to the one below by stairs", () => {
    for (const kind of KINDS)
      for (const plan of plansOf(kind)) {
        expect(plan.floors.length).toBeGreaterThanOrEqual(STOREYS[kind][0]);
        expect(plan.floors.length).toBeLessThanOrEqual(STOREYS[kind][1]);
        expect(plan.stairs.map((stairs) => stairs.from)).toEqual(floorsOf(plan).slice(0, -1));
      }
    expect(plansOf(BuildingKind.House).some((plan) => plan.floors.length === 2)).toBe(true);
    expect(plansOf(BuildingKind.Inn).some((plan) => plan.floors.length === 3)).toBe(true);
  });

  it("climb stairs a step at a time onto a landing, fenced round on the floor above", () => {
    for (const kind of KINDS)
      for (const plan of plansOf(kind))
        for (const stairs of plan.stairs) {
          const { approach, flight, landing } = stairTiles(stairs);
          const below = stairs.from;
          const climb = [
            heightOf(plan, below, approach),
            ...flight.map((spot) => heightOf(plan, below, spot)),
            heightOf(plan, below + 1, landing),
          ];
          climb.slice(1).forEach((height, i) => {
            expect(height - climb[i]!).toBeGreaterThan(0);
            expect(height - climb[i]!).toBeLessThanOrEqual(MAX_CLIMB);
          });
          expect(climb.at(-1)).toBe((below + 1) * STOREY);
          expect(cellOf(plan, approach.u, approach.v, below)).toBe(Prop.None);
          expect(cellOf(plan, landing.u, landing.v, below + 1)).toBe(Prop.None);
          for (const { u, v } of flight)
            for (const [du, dv] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const [nu, nv] = [u + du, v + dv];
              const isStairwell = flight.some((spot) => spot.u === nu && spot.v === nv);
              if (isStairwell || (nu === landing.u && nv === landing.v)) continue;
              expect(cellOf(plan, nu, nv, below + 1), `${kind} beside the stairwell`).not.toBe(Prop.None);
            }
        }
  });

  it("divide houses, shops and inns into rooms", () => {
    for (const kind of [BuildingKind.House, BuildingKind.Shop, BuildingKind.Inn])
      for (const plan of plansOf(kind)) {
        const interiorWalls = plan.floors[0]!.filter(
          (cell, i) => cell === Prop.Wall && !ringOf(plan).some(({ u, v }) => v * plan.width + u === i),
        ).length;
        expect(interiorWalls, kind).toBeGreaterThan(0);
      }
  });

  it("furnish each kind for its use", () => {
    for (const plan of plansOf(BuildingKind.Cottage)) {
      expect(count(plan, Prop.Hearth)).toBe(1);
      expect(count(plan, Prop.Bed)).toBeGreaterThan(0);
    }
    for (const plan of plansOf(BuildingKind.Church)) {
      expect(count(plan, Prop.Altar)).toBe(1);
      expect(count(plan, Prop.Bench)).toBeGreaterThan(8);
    }
    for (const plan of plansOf(BuildingKind.Smithy)) {
      expect(count(plan, Prop.Forge)).toBe(1);
      expect(count(plan, Prop.Anvil)).toBe(1);
    }
    for (const plan of plansOf(BuildingKind.Inn)) {
      expect(count(plan, Prop.Table)).toBeGreaterThan(2);
      expect(count(plan, Prop.Counter)).toBeGreaterThan(0);
    }
  });
});
