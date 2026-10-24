import {
  type Bounds,
  type FeatureType,
  type Reader,
  type Rng,
  type Stage,
  type Vec2,
  boundsOf,
  byPosition,
  distance,
  grid,
  rngOf,
  samePoint,
  scatter,
  stage,
} from "procgen";
import { MAX_SETTLEMENT_RADIUS, type Settlement } from "../settlement/layout";
import { isInSettlement } from "../settlement/siting";
import { CAMP_RADIUS, type Camp } from "../camp";
import { DEEP_FORESTNESS } from "../deep-forest";
import type { TileDraft } from "../feature";
import { type Province, Identity, PROVINCE_REACH } from "../../provinces";
import { type River, distanceToRiver } from "../../rivers";
import { Biome } from "../../terrain";
import { Way } from "../../terrain";
import { type CaveMouth, type WayLink, distinctWays } from "../../ways";
import { banditCamp } from "./bandit-camp";
import { den } from "./den";
import {
  type Land,
  type MinorDesign,
  MinorKind,
  type MinorPlan,
  type MinorSite,
  type Surroundings,
  ringAround,
} from "./kind";
import { smallCave } from "./small-cave";
import { standingStones } from "./standing-stones";
import { woodcutter } from "./woodcutter";

export { MinorKind, type MinorSite } from "./kind";

export const MINOR_DESIGNS: Record<MinorKind, MinorDesign> = {
  [MinorKind.BanditCamp]: banditCamp,
  [MinorKind.Woodcutter]: woodcutter,
  [MinorKind.Den]: den,
  [MinorKind.SmallCave]: smallCave,
  [MinorKind.StandingStones]: standingStones,
};

const WEIGHTS: Record<Identity, readonly (readonly [MinorKind, number])[]> = {
  [Identity.Farmland]: [
    [MinorKind.Woodcutter, 1.5],
    [MinorKind.Den, 1],
    [MinorKind.BanditCamp, 0.6],
    [MinorKind.SmallCave, 0.6],
  ],
  [Identity.Woodland]: [
    [MinorKind.Woodcutter, 3],
    [MinorKind.Den, 2],
    [MinorKind.SmallCave, 1],
    [MinorKind.BanditCamp, 0.6],
  ],
  [Identity.Highland]: [
    [MinorKind.SmallCave, 3],
    [MinorKind.Den, 2],
    [MinorKind.BanditCamp, 0.6],
    [MinorKind.Woodcutter, 0.5],
  ],
  [Identity.Wilds]: [
    [MinorKind.Den, 2],
    [MinorKind.SmallCave, 2],
    [MinorKind.BanditCamp, 1],
    [MinorKind.Woodcutter, 0.5],
  ],
  [Identity.Uncanny]: [
    [MinorKind.StandingStones, 4],
    [MinorKind.Den, 1],
    [MinorKind.SmallCave, 1],
  ],
};

export interface MinorLayout extends MinorPlan {
  readonly site: MinorSite;
}

export const MINOR_CELL = 160;
const MINOR_SPACING = 150;
const CANDIDATES = 5;
const CANDIDATE_MARGIN = 16;
export const MAX_MINOR_RADIUS = Math.max(...Object.values(MINOR_DESIGNS).map(({ radius }) => radius));
const WAY_REACH = 96;
const SETTLEMENT_REACH = 640;
const SETTLEMENT_CLEARANCE = 32;
const SETTLEMENT_SEARCH = MAX_SETTLEMENT_RADIUS + SETTLEMENT_CLEARANCE + MAX_MINOR_RADIUS;
const CAMP_CLEARANCE = CAMP_RADIUS + 24;
const RIVER_CLEARANCE = 4;
const FOREST_MARGIN = 0.05;
const FOREST_GAP = 2;
const MOUTH_CLEARANCE = 32;

export const minorCells = grid(MINOR_CELL);

export interface MinorSiting {
  readonly seed: number;
  readonly land: Land;
  readonly provinceAt: (reader: Reader, p: Vec2) => Province;
  readonly provinces: Stage<readonly Province[]>;
  readonly settlements: Stage<readonly Settlement[]>;
  readonly camps: Stage<readonly Camp[]>;
  readonly mouths: Stage<readonly CaveMouth[]>;
  readonly rivers: Stage<readonly River[]>;
  readonly waysNear: Stage<readonly WayLink[]>;
}

const surroundingsOf = (reader: Reader, { waysNear, settlements }: MinorSiting, p: Vec2): Surroundings => ({
  ways: distinctWays(reader.gather(waysNear, boundsOf([p], WAY_REACH))),
  settlements: [...new Set(reader.gather(settlements, boundsOf([p], SETTLEMENT_REACH)))],
});

const weightedOrder = (entries: readonly (readonly [MinorKind, number])[], rng: Rng, key: number): MinorKind[] => {
  const left = [...entries];
  const order: MinorKind[] = [];
  while (left.length > 0) {
    const kind = rng.weighted(left, key, order.length);
    order.push(kind);
    left.splice(
      left.findIndex(([k]) => k === kind),
      1,
    );
  }
  return order;
};

const isClear = (reader: Reader, siting: MinorSiting, p: Vec2, radius: number): boolean => {
  const { land } = siting;
  if (land.biomeAt(p) === Biome.Ocean) return false;
  const mouths = reader.gather(siting.mouths, boundsOf([p], MOUTH_CLEARANCE + radius));
  if (mouths.some(({ opening }) => distance(opening.outside, p) <= MOUTH_CLEARANCE + radius)) return false;
  const reach = [p, ...ringAround(p, radius / 2), ...ringAround(p, radius + FOREST_GAP)];
  if (reach.some((q) => land.conditions(q).forestness > DEEP_FORESTNESS - FOREST_MARGIN)) return false;
  const settlements = reader.gather(siting.settlements, boundsOf([p], SETTLEMENT_SEARCH));
  if (isInSettlement(settlements, p, SETTLEMENT_CLEARANCE + radius)) return false;
  if (
    reader
      .gather(siting.camps, boundsOf([p], CAMP_CLEARANCE + radius))
      .some((c) => distance(c, p) <= CAMP_CLEARANCE + radius)
  )
    return false;
  return reader.readAt(siting.rivers, p).every((river) => distanceToRiver(river, p) > radius + RIVER_CLEARANCE);
};

export const createMinorSites = (siting: MinorSiting) => {
  const candidates = stage({
    name: "minor candidates",
    grid: minorCells,
    reads: [
      { stage: siting.provinces, radius: PROVINCE_REACH },
      { stage: siting.settlements, radius: SETTLEMENT_SEARCH },
      { stage: siting.camps, radius: CAMP_CLEARANCE + MAX_MINOR_RADIUS },
      { stage: siting.mouths, radius: MOUTH_CLEARANCE + MAX_MINOR_RADIUS },
      { stage: siting.rivers, radius: 0 },
    ],
    compute: (cell, context): readonly MinorSite[] => {
      const { rng } = context;
      return scatter({ grid: minorCells, rng, count: CANDIDATES, margin: CANDIDATE_MARGIN })(cell).flatMap((p, i) => {
        const { identity } = siting.provinceAt(context, p);
        const kind = weightedOrder(WEIGHTS[identity], rng, i).find((k) => {
          const design = MINOR_DESIGNS[k];
          return isClear(context, siting, p, design.radius) && design.fits(p, siting.land);
        });
        return kind ? [{ ...p, id: rng.u32(i, 9), kind }] : [];
      });
    },
  });
  const rank = rngOf(siting.seed, "minor rank");
  const outranks = (a: MinorSite, b: MinorSite) =>
    rank.u32(a.x, a.y) > rank.u32(b.x, b.y) || (rank.u32(a.x, a.y) === rank.u32(b.x, b.y) && byPosition(a, b) < 0);
  return stage({
    name: "minor sites",
    grid: minorCells,
    reads: [{ stage: candidates, radius: MINOR_SPACING }],
    compute: (cell, { read, gather }): readonly MinorSite[] =>
      read(candidates, cell).filter((site) =>
        gather(candidates, boundsOf([site], MINOR_SPACING)).every(
          (rival) => samePoint(rival, site) || distance(rival, site) > MINOR_SPACING || !outranks(rival, site),
        ),
      ),
  });
};

export const minorBounds = (site: MinorSite): Bounds => boundsOf([site], MINOR_DESIGNS[site.kind].radius);

export const minorFeature = (
  siting: MinorSiting,
  sites: Stage<readonly MinorSite[]>,
): FeatureType<MinorSite, MinorLayout, TileDraft> => ({
  name: "minor",
  priority: 2,
  sites,
  reach: MAX_MINOR_RADIUS,
  extent: minorBounds,
  reads: [
    { stage: siting.waysNear, radius: WAY_REACH },
    { stage: siting.settlements, radius: SETTLEMENT_REACH },
  ],
  build: (site, context) => ({
    site,
    ...MINOR_DESIGNS[site.kind].build(site, siting.land, surroundingsOf(context, siting, site), context.rng),
  }),
  bounds: ({ site }) => minorBounds(site),
  paint: (layout, draft, x, y) => draft.way === Way.None && layout.paint(draft, x, y),
});
