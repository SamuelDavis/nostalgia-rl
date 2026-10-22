import { type Stage, type Vec2, boundsOf, byPosition, cos, distance, rngOf, samePoint, sin, stage } from "procgen";
import { REGION_SIZE } from "../../constants";
import { regions } from "../../region";
import { type River, distanceToRiver } from "../../rivers";
import { Biome } from "../../terrain";
import { TIERS, Tier, type Settlement } from "./layout";

export interface SettlementSiting {
  readonly seed: number;
  readonly level: (p: Vec2) => number;
  readonly biomeAt: (p: Vec2) => Biome;
  readonly forestness: (p: Vec2) => number;
  readonly deepForestness: number;
  readonly riverCourses: Stage<readonly River[]>;
}

export const SETTLEMENT_RIVER_CLEARANCE = 24;
const SETTLEMENT_CHANCE = 0.7;
const ATTEMPTS = 8;
const MARGIN = 32;
const GAP = 128;
const MAX_SPACING = 2 * TIERS[Tier.Town].radius + GAP;
const MAX_GRADIENT = 0.2;
const PROBES = 16;
const TIER_WEIGHTS: readonly (readonly [Tier, number])[] = [
  [Tier.Hamlet, 3],
  [Tier.Village, 4],
  [Tier.Town, 3],
];
const SETTLED: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest]);

export const createSettlementSites = ({
  seed,
  level,
  biomeAt,
  forestness,
  deepForestness,
  riverCourses,
}: SettlementSiting) => {
  const rng = rngOf(seed, "settlements");
  const ranks = rng.child("rank");

  const probesAround = (p: Vec2, radius: number): Vec2[] =>
    [radius / 2, radius].flatMap((r) =>
      Array.from({ length: PROBES }, (_, i) => ({
        x: Math.round(p.x + cos((i * 2 * Math.PI) / PROBES) * r),
        y: Math.round(p.y + sin((i * 2 * Math.PI) / PROBES) * r),
      })),
    );

  const suits = (p: Vec2, tier: Tier) => {
    const centre = level(p);
    return probesAround(p, TIERS[tier].radius).every(
      (q) =>
        SETTLED.has(biomeAt(q)) &&
        forestness(q) < deepForestness &&
        Math.abs(level(q) - centre) <= MAX_GRADIENT * TIERS[tier].radius,
    );
  };

  const candidates = stage({
    name: "settlement candidates",
    grid: regions,
    reads: [{ stage: riverCourses, radius: 0 }],
    compute: ({ col, row }, context): readonly Settlement[] => {
      const draws = context.rng;
      if (!draws.chance(SETTLEMENT_CHANCE, 0)) return [];
      const wanted = draws.weighted(TIER_WEIGHTS, 1);
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const p = {
          x: col * REGION_SIZE + draws.int(MARGIN, REGION_SIZE - MARGIN, attempt, 2),
          y: row * REGION_SIZE + draws.int(MARGIN, REGION_SIZE - MARGIN, attempt, 3),
        };
        if (!SETTLED.has(biomeAt(p))) continue;
        const clear = context
          .readAt(riverCourses, p)
          .every((river) => distanceToRiver(river, p) > TIERS[Tier.Hamlet].square + SETTLEMENT_RIVER_CLEARANCE);
        if (!clear) continue;
        for (let tier = wanted; tier >= Tier.Hamlet; tier--)
          if (suits(p, tier as Tier)) return [{ ...p, tier: tier as Tier, id: draws.u32(attempt, 4) }];
      }
      return [];
    },
  });

  const rankOf = (settlement: Settlement) => settlement.tier + ranks.unit(settlement.x, settlement.y);
  const outranks = (a: Settlement, b: Settlement) =>
    rankOf(a) > rankOf(b) || (rankOf(a) === rankOf(b) && byPosition(a, b) < 0);
  const crowds = (a: Settlement, b: Settlement) => distance(a, b) < TIERS[a.tier].radius + TIERS[b.tier].radius + GAP;

  return stage({
    name: "settlements",
    grid: regions,
    reads: [{ stage: candidates, radius: MAX_SPACING }],
    compute: (cell, { read, gather }): readonly Settlement[] =>
      read(candidates, cell).filter((settlement) =>
        gather(candidates, boundsOf([settlement], MAX_SPACING)).every(
          (rival) => samePoint(rival, settlement) || !crowds(rival, settlement) || !outranks(rival, settlement),
        ),
      ),
  });
};

export const isInSettlement = (settlements: readonly Settlement[], p: Vec2, margin: number): boolean =>
  settlements.some((settlement) => distance(settlement, p) <= TIERS[settlement.tier].radius + margin);
