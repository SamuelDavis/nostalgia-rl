import { type Rng, type Vec2, distance } from "procgen";
import type { Conditions } from "../../fields";
import type { Biome } from "../../terrain";
import type { WayLink } from "../../ways";
import type { Building } from "../building/building";
import type { Anchor, TileDraft } from "../feature";
import type { Purpose } from "../purpose";
import type { Settlement } from "../settlement/layout";

export const MinorKind = {
  BanditCamp: "bandit camp",
  Woodcutter: "woodcutter's hut",
  Den: "den",
  SmallCave: "small cave",
  StandingStones: "standing stones",
} as const;
export type MinorKind = (typeof MinorKind)[keyof typeof MinorKind];

export interface MinorSite extends Anchor {
  readonly kind: MinorKind;
}

export interface Land {
  readonly level: (p: Vec2) => number;
  readonly biomeAt: (p: Vec2) => Biome;
  readonly conditions: (p: Vec2) => Conditions;
}

export interface Surroundings {
  readonly ways: readonly WayLink[];
  readonly settlements: readonly Settlement[];
}

export interface MinorPlan {
  readonly purpose: Purpose;
  readonly buildings: readonly Building[];
  readonly paint: (draft: TileDraft, x: number, y: number) => boolean;
}

export interface MinorDesign {
  readonly radius: number;
  readonly fits: (p: Vec2, land: Land) => boolean;
  readonly build: (site: MinorSite, land: Land, around: Surroundings, rng: Rng) => MinorPlan;
}

const RING: readonly Vec2[] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
].map(([x, y]) => ({ x: x! / Math.sqrt(x! * x! + y! * y!), y: y! / Math.sqrt(x! * x! + y! * y!) }));

export const CARDINALS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export const ringAround = (p: Vec2, radius: number): Vec2[] =>
  RING.map((d) => ({ x: Math.round(p.x + d.x * radius), y: Math.round(p.y + d.y * radius) }));

export const medianLevel = (land: Land, points: readonly Vec2[]): number =>
  points.map(land.level).sort((a, b) => a - b)[points.length >> 1]!;

export const isFlat = (land: Land, p: Vec2, radius: number, tolerance: number): boolean => {
  const level = land.level(p);
  return ringAround(p, radius).every((q) => Math.abs(land.level(q) - level) <= tolerance);
};

export const centreOf = (p: Vec2): Vec2 => ({ x: p.x + 0.5, y: p.y + 0.5 });

export const gapFrom = (site: Vec2, x: number, y: number): number => distance(centreOf({ x, y }), centreOf(site));

export const nearestCardinal = (from: Vec2, to: Vec2): Vec2 =>
  CARDINALS.reduce((best, c) =>
    c.x * (to.x - from.x) + c.y * (to.y - from.y) > best.x * (to.x - from.x) + best.y * (to.y - from.y) ? c : best,
  );
