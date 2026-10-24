import { describe, expect, it } from "vitest";
import { type Vec2, distance, overlaps, expand, projectOntoSegment, rngOf } from "procgen";
import { Way } from "../../terrain";
import { WAY_SHAPES } from "../../ways";
import { footprintOf } from "../building/building";
import { BuildingKind } from "../building/plan";
import { type Street, TIERS, Tier, type SettlementGround, type SettlementLayout, layOutSettlement } from "./layout";

const CENTRE = { x: 1000, y: 2000 };
const crossroads: Street[] = [
  { nodes: [{ x: CENTRE.x - 150, y: CENTRE.y + 3 }, CENTRE, { x: CENTRE.x + 150, y: CENTRE.y - 4 }], way: Way.Road },
  { nodes: [{ x: CENTRE.x + 5, y: CENTRE.y - 150 }, CENTRE, { x: CENTRE.x - 6, y: CENTRE.y + 150 }], way: Way.Road },
];
const flat: SettlementGround = { isBuildable: () => true, level: () => 100 };
const layoutOf = (tier: Tier, seed: number, ground = flat, streets = crossroads) =>
  layOutSettlement({ ...CENTRE, id: seed, tier }, streets, ground, rngOf(seed, "settlement"));

const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);
const TIER_LIST = Object.values(Tier);

const streetsOf = (layout: SettlementLayout): Street[] => [...crossroads, ...layout.lanes];
const distanceToStreet = (streets: readonly Street[], p: Vec2) =>
  Math.min(
    ...streets.flatMap(({ nodes, way }) =>
      nodes.slice(1).map((b, i) => projectOntoSegment(p, nodes[i]!, b).distance - WAY_SHAPES[way].halfWidth),
    ),
  );
const centreOf = (p: Vec2) => ({ x: p.x + 0.5, y: p.y + 0.5 });

describe("settlement layout", () => {
  it("grows as many buildings as its tier asks for, within its radius", () => {
    for (const tier of TIER_LIST)
      for (const seed of SEEDS) {
        const layout = layoutOf(tier, seed);
        const { buildings, radius } = TIERS[tier];
        expect(layout.buildings.length, `tier ${tier} seed ${seed}`).toBeGreaterThanOrEqual(buildings[0]);
        expect(layout.buildings.length).toBeLessThanOrEqual(buildings[1]);
        for (const building of layout.buildings)
          for (const p of footprintOf(building)) expect(distance(centreOf(p), CENTRE)).toBeLessThanOrEqual(radius);
      }
  });

  it("keeps a gap between buildings and keeps them off the streets", () => {
    for (const tier of TIER_LIST)
      for (const seed of SEEDS) {
        const layout = layoutOf(tier, seed);
        const streets = streetsOf(layout);
        layout.buildings.forEach((a, i) => {
          for (const b of layout.buildings.slice(i + 1)) expect(overlaps(expand(a.bounds, 1), b.bounds)).toBe(false);
          for (const p of footprintOf(a)) expect(distanceToStreet(streets, centreOf(p))).toBeGreaterThan(0.5);
        });
      }
  });

  it("leads a path from every door to a street", () => {
    for (const tier of TIER_LIST)
      for (const seed of SEEDS) {
        const layout = layoutOf(tier, seed);
        const streets = streetsOf(layout);
        for (const { door, path } of layout.buildings) {
          const steps = [door, ...path];
          steps.slice(1).forEach((p, i) => expect(distance(p, steps[i]!)).toBe(1));
          const last = steps.at(-1)!;
          const beyond = { x: 2 * last.x - steps.at(-2)!.x, y: 2 * last.y - steps.at(-2)!.y };
          expect(
            Math.min(distanceToStreet(streets, centreOf(last)), distanceToStreet(streets, centreOf(beyond))),
          ).toBeLessThanOrEqual(0);
        }
      }
  });

  it("gives villages and settlements their landmarks", () => {
    for (const seed of SEEDS) {
      const kinds = (tier: Tier) => layoutOf(tier, seed).buildings.map(({ plan }) => plan.kind);
      expect(kinds(Tier.Village)).toEqual(expect.arrayContaining([BuildingKind.Inn, BuildingKind.Chapel]));
      expect(kinds(Tier.Town)).toEqual(
        expect.arrayContaining([BuildingKind.Inn, BuildingKind.Church, BuildingKind.Hall, BuildingKind.Smithy]),
      );
    }
  });

  it("builds only on buildable ground, levelling each building", () => {
    const east: SettlementGround = {
      isBuildable: (p) => p.x < CENTRE.x + 10,
      level: (p) => 100 + Math.floor((p.x - CENTRE.x) / 20),
    };
    for (const seed of SEEDS)
      for (const building of layoutOf(Tier.Village, seed, east).buildings) {
        for (const p of footprintOf(building)) expect(p.x).toBeLessThan(CENTRE.x + 10);
        expect(Number.isInteger(building.level)).toBe(true);
      }
  });

  it("is a pure function of its inputs", () => {
    expect(layoutOf(Tier.Town, 5)).toEqual(layoutOf(Tier.Town, 5));
  });
});
