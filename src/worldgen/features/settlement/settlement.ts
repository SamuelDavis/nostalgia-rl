import {
  type Bounds,
  type FeatureType,
  type Stage,
  type Vec2,
  boundsOf,
  contains,
  distance,
  expand,
  projectOntoSegment,
} from "procgen";
import { SEA_LEVEL } from "../../constants";
import { type River, distanceToRiver } from "../../rivers";
import { Biome, Cover, Ground, Prop, Water, Way } from "../../terrain";
import { WAY_SHAPES, type WayLink, distinctWays } from "../../ways";
import { type TileDraft, settle } from "../feature";
import { type Building, paintBuilding } from "../building/building";
import {
  MAX_SETTLEMENT_RADIUS,
  type Street,
  TIERS,
  Tier,
  type Settlement,
  type SettlementGround,
  type SettlementLayout,
  layOutSettlement,
} from "./layout";

export interface SettlementInput {
  readonly level: (p: Vec2) => number;
  readonly biomeAt: (p: Vec2) => Biome;
  readonly sites: Stage<readonly Settlement[]>;
  readonly rivers: Stage<readonly River[]>;
  readonly waysNear: Stage<readonly WayLink[]>;
}

export interface PaintedSettlement extends SettlementLayout {
  readonly buildingsAt: (p: Vec2) => readonly Building[];
  readonly isPath: (p: Vec2) => boolean;
  readonly streetAt: (p: Vec2) => Way | undefined;
}

const PRIORITY = 1;
const SEAM = 3;
const MARGIN = 8;
const BUCKET = 8;
const RIVER_CLEARANCE = 13;
const BUILDABLE: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest]);
const SQUARE_GROUND: Record<Tier, Ground | undefined> = {
  [Tier.Hamlet]: Ground.Dirt,
  [Tier.Village]: undefined,
  [Tier.Town]: Ground.Dressed,
};

const areaOf = (settlement: Settlement): Bounds => boundsOf([settlement], TIERS[settlement.tier].radius + MARGIN);
const tileKey = ({ x, y }: Vec2) => `${x},${y}`;
const centreOf = (p: Vec2): Vec2 => ({ x: p.x + 0.5, y: p.y + 0.5 });

const rasterize = (streets: readonly Street[], area: Bounds): Map<string, Way> => {
  const tiles = new Map<string, Way>();
  for (const { nodes, way } of streets)
    nodes.slice(1).forEach((b, i) => {
      const a = nodes[i]!;
      const { halfWidth } = WAY_SHAPES[way];
      for (let x = Math.floor(Math.min(a.x, b.x) - halfWidth); x <= Math.ceil(Math.max(a.x, b.x) + halfWidth); x++)
        for (let y = Math.floor(Math.min(a.y, b.y) - halfWidth); y <= Math.ceil(Math.max(a.y, b.y) + halfWidth); y++) {
          const key = tileKey({ x, y });
          const isOn = projectOntoSegment(centreOf({ x, y }), a, b).distance <= halfWidth;
          if (isOn && contains(area, { x, y }) && tiles.get(key) !== Way.Road) tiles.set(key, way);
        }
    });
  return tiles;
};

const bucketed = (buildings: readonly Building[]) => {
  const buckets = new Map<string, Building[]>();
  const bucketOf = (x: number, y: number) => `${Math.floor(x / BUCKET)},${Math.floor(y / BUCKET)}`;
  for (const building of buildings) {
    const { minX, minY, maxX, maxY } = expand(building.bounds, SEAM);
    for (let bx = Math.floor(minX / BUCKET); bx <= Math.floor(maxX / BUCKET); bx++)
      for (let by = Math.floor(minY / BUCKET); by <= Math.floor(maxY / BUCKET); by++) {
        const key = `${bx},${by}`;
        buckets.set(key, [...(buckets.get(key) ?? []), building]);
      }
  }
  return (p: Vec2) => (buckets.get(bucketOf(p.x, p.y)) ?? []).filter((b) => contains(expand(b.bounds, SEAM), p));
};

const gapTo = ({ minX, minY, maxX, maxY }: Bounds, p: Vec2) =>
  distance({ x: Math.max(minX - p.x, 0, p.x - maxX), y: Math.max(minY - p.y, 0, p.y - maxY) }, { x: 0, y: 0 });

const groundOf = (input: SettlementInput, rivers: readonly River[]): SettlementGround => {
  const known = new Map<string, boolean>();
  return {
    level: input.level,
    isBuildable: (p) => {
      const key = tileKey(p);
      let buildable = known.get(key);
      if (buildable === undefined) {
        const centre = centreOf(p);
        buildable =
          input.level(p) > SEA_LEVEL &&
          BUILDABLE.has(input.biomeAt(p)) &&
          rivers.every((river) => distanceToRiver(river, centre) > RIVER_CLEARANCE);
        known.set(key, buildable);
      }
      return buildable;
    },
  };
};

const paintOpen = (draft: TileDraft) => {
  draft.prop = Prop.None;
  draft.part = 0;
  draft.cover = Cover.None;
};

export const settlementFeature = (input: SettlementInput): FeatureType<Settlement, PaintedSettlement, TileDraft> => ({
  name: "settlement",
  priority: PRIORITY,
  sites: input.sites,
  reach: MAX_SETTLEMENT_RADIUS + MARGIN,
  extent: areaOf,
  reads: [
    { stage: input.waysNear, radius: MAX_SETTLEMENT_RADIUS + MARGIN },
    { stage: input.rivers, radius: MAX_SETTLEMENT_RADIUS + MARGIN },
  ],
  build: (settlement, { gather, rng }) => {
    const area = areaOf(settlement);
    const radius = TIERS[settlement.tier].radius;
    const roads = distinctWays(gather(input.waysNear, area)).filter(({ nodes }) =>
      nodes.some((p) => distance(p, settlement) <= radius),
    );
    const layout = layOutSettlement(settlement, roads, groundOf(input, [...new Set(gather(input.rivers, area))]), rng);
    const paths = new Set(layout.buildings.flatMap(({ path }) => path.map(tileKey)));
    const streets = rasterize([...roads, ...layout.lanes], area);
    return {
      ...layout,
      buildingsAt: bucketed(layout.buildings),
      isPath: (p) => paths.has(tileKey(p)),
      streetAt: (p) => streets.get(tileKey(p)),
    };
  },
  bounds: ({ settlement }) => areaOf(settlement),
  paint: ({ settlement, square, buildingsAt, isPath, streetAt }, draft, x, y) => {
    const p = { x, y };
    const near = buildingsAt(p)
      .map((building) => ({ building, gap: gapTo(building.bounds, p) }))
      .sort((a, b) => b.gap - a.gap);
    const inside = near.find(({ gap }) => gap === 0);
    if (inside) {
      paintBuilding(inside.building, draft, p);
      return true;
    }
    const fromSquare = distance(centreOf(p), centreOf(settlement)) - square.radius;
    if (fromSquare <= SEAM) draft.height = settle(draft.height, square.level, fromSquare);
    for (const { building, gap } of near) draft.height = settle(draft.height, building.level, gap - 1);
    const street = streetAt(p);
    if (street !== undefined) {
      paintOpen(draft);
      draft.way = street;
      if (draft.water !== Water.None) draft.prop = Prop.Bridge;
      return true;
    }
    if (isPath(p)) {
      paintOpen(draft);
      draft.way = Way.Path;
      return true;
    }
    if (fromSquare <= 0) {
      paintOpen(draft);
      draft.water = Water.None;
      draft.ground = SQUARE_GROUND[settlement.tier] ?? draft.ground;
      if (square.well && x === square.well.x && y === square.well.y) draft.prop = Prop.Well;
      return true;
    }
    if (near.length === 0 && fromSquare > SEAM) return false;
    if (draft.way === Way.None && draft.water === Water.None) paintOpen(draft);
    return true;
  },
});
