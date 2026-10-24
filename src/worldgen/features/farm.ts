import {
  type Bounds,
  type FeatureType,
  type Stage,
  type StageContext,
  type Vec2,
  boundsOf,
  contains,
  distance,
  expand,
  overlaps,
  stage,
} from "procgen";
import { metresToLevels } from "../constants";
import { regions } from "../region";
import { type River, distanceToRiver } from "../rivers";
import { Biome, Cover, Ground, Prop, Water, Way } from "../terrain";
import { type WayLink, distinctWays, nearestWayPoint } from "../ways";
import { type Building, boundsOfBuilding, frameOf, paintBuilding } from "./building/building";
import { BuildingKind, planBuilding } from "./building/plan";
import { CAMP_RADIUS, type Camp } from "./camp";
import { MAX_MINOR_RADIUS, type MinorSite, minorBounds } from "./minor/minor";
import { DEEP_FORESTNESS } from "./deep-forest";
import { type Anchor, type TileDraft, settle } from "./feature";
import { type Frame, toLocal, toWorld } from "./frame";
import { Good, Occupant, type Purpose, Role } from "./purpose";
import { MAX_SETTLEMENT_RADIUS, TIERS, Tier, type Settlement } from "./settlement/layout";
import { isInSettlement } from "./settlement/siting";

export interface Farm extends Anchor {
  readonly forward: Vec2;
  readonly setback: number;
  readonly produce: Good;
  readonly settlement: Vec2;
}

export interface FarmLayout {
  readonly farm: Farm;
  readonly purpose: Purpose;
  readonly buildings: readonly Building[];
  readonly bounds: Bounds;
  readonly paint: (draft: TileDraft, x: number, y: number) => boolean;
}

export interface FarmSiting {
  readonly level: (p: Vec2) => number;
  readonly biomeAt: (p: Vec2) => Biome;
  readonly forestness: (p: Vec2) => number;
  readonly settlements: Stage<readonly Settlement[]>;
  readonly camps: Stage<readonly Camp[]>;
  readonly rivers: Stage<readonly River[]>;
  readonly waysNear: Stage<readonly WayLink[]>;
  readonly minors: Stage<readonly MinorSite[]>;
}

const HALF = 13;
const YARD = 16;
const FIELD_START = YARD + 2;
const FIELD_DEPTH = 22;
const FIELD_END = FIELD_START + FIELD_DEPTH;
const SEAM = 3;
const HOUSE_DOOR = -6;
const BARN_DOOR = 5;
const ROAD_SETBACKS = [4, 10] as const;
const FARM_GAP = 16;
const FARM_REACH = 160;
const FARM_STEP = 16;
const ORCHARD_STEP = 3;
const SAMPLE_STEP = 6;
const UNEVENNESS = metresToLevels(5);
const RIVER_CLEARANCE = 4;
const FOREST_MARGIN = 0.05;
export const FARM_EXTENT = Math.ceil(
  Math.sqrt((HALF + SEAM) * (HALF + SEAM) + (FIELD_END + SEAM) * (FIELD_END + SEAM)),
);
const SITE_REACH = MAX_SETTLEMENT_RADIUS + FARM_REACH + Math.max(...ROAD_SETBACKS);
const BUILDABLE: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest]);
const FARMS: Record<Tier, number> = { [Tier.Hamlet]: 2, [Tier.Village]: 4, [Tier.Town]: 6 };
const PRODUCE: Partial<Record<Biome, readonly (readonly [Good, number])[]>> = {
  [Biome.Grassland]: [
    [Good.Grain, 5],
    [Good.Livestock, 3],
    [Good.Fruit, 2],
  ],
  [Biome.Forest]: [
    [Good.Fruit, 4],
    [Good.Livestock, 4],
    [Good.Grain, 2],
  ],
};

const frameOfFarm = ({ x, y, forward }: Farm): Frame => ({ origin: { x, y }, forward });

const farmBounds = (farm: Farm): Bounds => {
  const frame = frameOfFarm(farm);
  const front = -Math.max(SEAM, farm.setback);
  return boundsOf(
    [
      [-HALF - SEAM, front],
      [HALF + SEAM, front],
      [-HALF - SEAM, FIELD_END + SEAM],
      [HALF + SEAM, FIELD_END + SEAM],
    ].map(([u, v]) => toWorld(frame, u!, v!)),
  );
};

const cardinalOf = ({ x, y }: Vec2): Vec2 =>
  Math.abs(x) >= Math.abs(y) ? { x: Math.sign(x), y: 0 } : { x: 0, y: Math.sign(y) };

interface Spot {
  readonly site: Vec2;
  readonly forward: Vec2;
  readonly setback: number;
}

export const spotsAlong = (settlement: Settlement, roads: readonly WayLink[]): Spot[] => {
  const radius = TIERS[settlement.tier].radius;
  return roads
    .flatMap(({ nodes }) => {
      const outward =
        distance(nodes[0]!, settlement) < distance(nodes.at(-1)!, settlement) ? nodes : [...nodes].reverse();
      return Array.from({ length: Math.floor((FARM_REACH - FARM_GAP) / FARM_STEP) + 1 }, (_, k) => {
        const reach = radius + FARM_GAP + k * FARM_STEP;
        const i = outward.findIndex((n) => distance(n, settlement) >= reach);
        if (i <= 0) return [];
        const [a, b] = [outward[i - 1]!, outward[i]!];
        const length = distance(a, b);
        if (length === 0) return [];
        const normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
        return [1, -1].flatMap((side) => {
          const forward = cardinalOf({ x: normal.x * side, y: normal.y * side });
          return ROAD_SETBACKS.map((setback) => ({
            site: { x: Math.round(b.x + forward.x * setback), y: Math.round(b.y + forward.y * setback) },
            forward,
            setback,
          }));
        });
      }).flat();
    })
    .sort(
      (p, q) =>
        distance(p.site, settlement) - distance(q.site, settlement) || p.site.x - q.site.x || p.site.y - q.site.y,
    );
};

const samplesOf = (farm: Farm): Vec2[] => {
  const frame = frameOfFarm(farm);
  const samples: Vec2[] = [];
  for (let u = -HALF; u <= HALF; u += SAMPLE_STEP)
    for (let v = 0; v <= FIELD_END; v += SAMPLE_STEP) samples.push(toWorld(frame, u, v));
  return samples;
};

export const createFarms = (siting: FarmSiting) =>
  stage({
    name: "farms",
    grid: regions,
    reads: [
      { stage: siting.settlements, radius: 2 * SITE_REACH + FARM_EXTENT },
      { stage: siting.camps, radius: SITE_REACH + FARM_EXTENT },
      { stage: siting.rivers, radius: SITE_REACH + FARM_EXTENT },
      { stage: siting.waysNear, radius: SITE_REACH + FARM_EXTENT },
      { stage: siting.minors, radius: SITE_REACH + FARM_EXTENT + MAX_MINOR_RADIUS },
    ],
    compute: (region, context): readonly Farm[] =>
      context.read(siting.settlements, region).flatMap((settlement) => farmsOf(siting, context, settlement)),
  });

const farmsOf = (siting: FarmSiting, reader: StageContext, settlement: Settlement): Farm[] => {
  const radius = TIERS[settlement.tier].radius;
  const roads = distinctWays(reader.gather(siting.waysNear, boundsOf([settlement], radius))).filter(({ nodes }) =>
    nodes.some((n) => distance(n, settlement) <= radius),
  );
  const farms: Farm[] = [];
  for (const { site, forward, setback } of spotsAlong(settlement, roads)) {
    if (farms.length >= FARMS[settlement.tier]) break;
    const produces = PRODUCE[siting.biomeAt(site)];
    if (!produces) continue;
    const farm: Farm = {
      ...site,
      id: reader.rng.u32(site.x, site.y),
      forward,
      setback,
      produce: reader.rng.weighted(produces, site.x, site.y, 1),
      settlement: { x: settlement.x, y: settlement.y },
    };
    const bounds = farmBounds(farm);
    const samples = samplesOf(farm);
    const levels = samples.map(siting.level);
    const isOpenLand =
      farms.every((f) => !overlaps(expand(farmBounds(f), SEAM), bounds)) &&
      Math.max(...levels) - Math.min(...levels) <= UNEVENNESS &&
      samples.every(
        (p) =>
          BUILDABLE.has(siting.biomeAt(p)) &&
          siting.forestness(p) < DEEP_FORESTNESS - FOREST_MARGIN &&
          reader.readAt(siting.rivers, p).every((r) => distanceToRiver(r, p) > RIVER_CLEARANCE),
      );
    if (!isOpenLand) continue;
    const around = boundsOf([site], FARM_EXTENT);
    const ways = distinctWays(reader.gather(siting.waysNear, around));
    const camps = reader.gather(siting.camps, around);
    const minors = reader.gather(siting.minors, expand(around, MAX_MINOR_RADIUS));
    const settlements = reader.gather(siting.settlements, boundsOf([site], distance(settlement, site) + FARM_EXTENT));
    const isClear =
      settlements.every(
        (s) => s.id === settlement.id || distance(s, site) > distance(settlement, site) + FARM_EXTENT,
      ) &&
      samples.every(
        (p) =>
          !isInSettlement(settlements, p, SEAM) &&
          camps.every((c) => distance(c, p) > CAMP_RADIUS + SEAM) &&
          minors.every((m) => !contains(minorBounds(m), p)) &&
          (nearestWayPoint(ways, p)?.distance ?? Infinity) > 2,
      );
    if (isClear) farms.push(farm);
  }
  return farms;
};

const buildingAt = (farm: Farm, kind: BuildingKind, u: number, level: number, rng: StageContext["rng"]) => {
  const plan = planBuilding(kind, rng.child(kind));
  const door = toWorld(frameOfFarm(farm), u, 1);
  const facing = { x: -farm.forward.x, y: -farm.forward.y };
  const frame = frameOf({ plan, door, facing });
  const path = Array.from({ length: farm.setback }, (_, i) => toWorld(frameOfFarm(farm), u, -i));
  return {
    plan,
    frame,
    level,
    bounds: boundsOfBuilding({ plan, frame }),
    door,
    path,
    roof: Cover.Thatch,
  };
};

const levelOfYard = (farm: Farm, level: (p: Vec2) => number): number => {
  const frame = frameOfFarm(farm);
  const levels = [-HALF, 0, HALF]
    .flatMap((u) => [0, YARD / 2, YARD].map((v) => level(toWorld(frame, u, v))))
    .sort((a, b) => a - b);
  return levels[levels.length >> 1]!;
};

const paintField = (produce: Good, draft: TileDraft, u: number, v: number) => {
  const row = v - FIELD_START;
  draft.prop = Prop.None;
  draft.part = 0;
  if (produce === Good.Grain) {
    draft.ground = Ground.Tilled;
    if (row % 2 === 0 && Math.abs(u) < HALF) draft.prop = Prop.Crop;
  } else if (produce === Good.Fruit) {
    if ((u + HALF) % ORCHARD_STEP === 1 && row % ORCHARD_STEP === 1) draft.prop = Prop.FruitTree;
  } else {
    const isEdge = Math.abs(u) === HALF || row === 0 || v === FIELD_END;
    const isGate = row === 0 && Math.abs(u) <= 1;
    if (isEdge && !isGate) draft.prop = Prop.Fence;
  }
};

export const farmFeature = (
  siting: FarmSiting,
  sites: Stage<readonly Farm[]>,
): FeatureType<Farm, FarmLayout, TileDraft> => ({
  name: "farm",
  priority: 1,
  sites,
  reach: FARM_EXTENT,
  extent: farmBounds,
  build: (farm, { rng }) => {
    const level = levelOfYard(farm, siting.level);
    const house = buildingAt(
      farm,
      rng.chance(0.5, 0) ? BuildingKind.House : BuildingKind.Cottage,
      HOUSE_DOOR,
      level,
      rng,
    );
    const barn = buildingAt(farm, BuildingKind.Barn, BARN_DOOR, level, rng);
    const buildings = [house, barn];
    const frame = frameOfFarm(farm);
    const paths = new Set(buildings.flatMap(({ path }) => path.map(({ x, y }) => `${x},${y}`)));
    return {
      farm,
      buildings,
      bounds: farmBounds(farm),
      purpose: {
        role: Role.Worksite,
        occupants: [Occupant.Farmer],
        produces: [farm.produce],
        relation: { kind: "supplies", target: farm.settlement },
      },
      paint: (draft, x, y) => {
        const p = { x, y };
        const building = buildings.find(({ bounds }) => contains(bounds, p));
        if (building) {
          paintBuilding(building, draft, p);
          return true;
        }
        const { u, v } = toLocal(frame, p);
        const outside = Math.max(Math.abs(u) - HALF, -v, v - FIELD_END, 0);
        const outsideYard = Math.max(Math.abs(u) - HALF, -v, v - YARD, 0);
        draft.height = settle(draft.height, level, outsideYard);
        if (paths.has(`${x},${y}`)) {
          if (draft.way !== Way.None) return true;
          draft.water = Water.None;
          draft.prop = Prop.None;
          draft.part = 0;
          draft.way = Way.Path;
          return true;
        }
        if (outside > 0) return outsideYard <= SEAM;
        draft.water = Water.None;
        if (v >= FIELD_START) paintField(farm.produce, draft, u, v);
        else draft.prop = Prop.None;
        draft.part = 0;
        return true;
      },
    };
  },
  bounds: ({ bounds }) => bounds,
  paint: (layout, draft, x, y) => layout.paint(draft, x, y),
});
