import {
  type Cell,
  type Placed,
  type Vec2,
  type World,
  boundsOf,
  contains,
  createWorld,
  featuresNear,
  placedOf,
} from "procgen";
import { biomeOf } from "./biome";
import { type Explored, MOUTH_REACH, createCaves } from "./features/cave/cave";
import type { FloorLayout } from "./features/cave/floor";
import type { MineYard } from "./features/cave/yard";
import type { Cave } from "./features/cave/siting";
import { CHUNK_RIVER_MARGIN, CHUNK_WAY_MARGIN, type Chunk, chunks, createSurface, floorChunk } from "./chunk";
import { heightLevel } from "./constants";
import { type Camp, RIVER_CLEARANCE, campFeature, campSiting, createCampSites, findSpawn } from "./features/camp";
import {
  DEEP_FORESTNESS,
  type DeepForest,
  type DeepForestLayout,
  OPENING_REACH,
  createDeepForests,
} from "./features/deep-forest";
import type { Settlement } from "./features/settlement/layout";
import { SETTLEMENT_RIVER_CLEARANCE, createSettlementSites } from "./features/settlement/siting";
import { type PaintedSettlement, settlementFeature } from "./features/settlement/settlement";
import type { Opening, TileDraft } from "./features/feature";
import { type Fields, createFields } from "./fields";
import { type CaveFloor, type Layer, SURFACE, isStorey } from "./layer";
import { storeyChunk, storeyLinks } from "./features/building/storeys";
import type { Building } from "./features/building/building";
import { createPeaks } from "./landmarks";
import { type Province, createProvinces } from "./provinces";
import { regions } from "./region";
import { type River, createRivers } from "./rivers";
import { type WayLink, createWayness, createWays } from "./ways";

export type { Camp } from "./features/camp";
export type { DeepForestLayout } from "./features/deep-forest";
export type { PaintedSettlement } from "./features/settlement/settlement";
export { BuildingKind } from "./features/building/plan";
export type { Building } from "./features/building/building";
export { TIERS, Tier, type Settlement } from "./features/settlement/layout";
export { Identity, type Province } from "./provinces";

const WAY_MARGIN = 8;

export interface Worldgen {
  readonly seed: number;
  readonly fields: Fields;
  readonly spawn: Camp;
  readonly world: World;
  readonly caves: Explored;
  readonly stages: ReturnType<typeof createStages>;
  readonly riversNear: (region: Cell) => readonly River[];
  readonly campAt: (region: Cell) => Camp | undefined;
  readonly waysNear: (region: Cell) => readonly WayLink[];
  readonly deepForestsIn: (region: Cell) => readonly Placed<TileDraft, DeepForest, DeepForestLayout>[];
  readonly caveMouthsIn: (region: Cell) => readonly Opening[];
  readonly mineEntrancesIn: (region: Cell) => readonly Opening[];
  readonly mineYardsIn: (region: Cell) => readonly Placed<TileDraft, Cave, MineYard>[];
  readonly settlementsIn: (region: Cell) => readonly Placed<TileDraft, Settlement, PaintedSettlement>[];
  readonly caveFloorOf: (layer: CaveFloor) => FloorLayout | undefined;
  readonly linkAcross: (layer: Layer, from: Vec2, to: Vec2) => Layer | undefined;
  readonly buildingAt: (p: Vec2) => Building | undefined;
  readonly provinceAt: (p: Vec2) => Province;
  readonly provincesAround: (p: Vec2) => readonly Province[];
}

const createStages = (seed: number, fields: Fields, world: World) => {
  const level = (p: Vec2) => heightLevel(fields.elevation(p.x, p.y));
  const biomeAt = (p: Vec2) => biomeOf(fields.conditions(p.x, p.y));

  const rivers = createRivers(seed, fields);
  const provinces = createProvinces(fields);
  const settlements = createSettlementSites({
    seed,
    level,
    biomeAt,
    forestness: (p) => fields.forestness(p.x, p.y),
    deepForestness: DEEP_FORESTNESS,
    riverCourses: rivers.coursesNear(regions, SETTLEMENT_RIVER_CLEARANCE),
  });
  const siting = campSiting({ level, biomeAt, riverBands: rivers.coursesNear(regions, RIVER_CLEARANCE), settlements });
  const spawn = findSpawn(seed, world, siting);
  const camps = createCampSites(siting, spawn);
  const peaks = createPeaks(fields);
  const wayness = createWayness({ fields, camps, settlements });
  const caves = createCaves({
    seed,
    fields,
    peaks,
    waynessAt: wayness.at,
    waynessReads: wayness.reads(MOUTH_REACH),
  });
  const deepForests = createDeepForests({
    seed,
    level,
    forestness: (p) => fields.forestness(p.x, p.y),
    camps,
    rivers: rivers.near(regions),
  });
  const ways = createWays({
    seed,
    fields,
    wayness,
    peaks,
    forestOpenings: deepForests.openings,
    forestOpeningReach: OPENING_REACH,
    caveMouths: caves.mouths,
    caveMouthReach: MOUTH_REACH,
  });
  const waysNearRegions = ways.near(regions, WAY_MARGIN);
  const features = {
    deepForest: deepForests.feature(waysNearRegions),
    camp: campFeature(seed, siting, camps, waysNearRegions),
    mineYard: caves.yardFeature(waysNearRegions),
    settlement: settlementFeature({
      level,
      biomeAt,
      sites: settlements,
      rivers: rivers.near(regions),
      waysNear: waysNearRegions,
    }),
    caveMouth: caves.mouthFeature,
  };
  const featuresNearChunks = featuresNear("features near chunks", chunks, [
    features.deepForest,
    features.camp,
    features.settlement,
    features.mineYard,
    features.caveMouth,
  ]);
  const surface = createSurface({
    seed,
    fields,
    features: featuresNearChunks,
    rivers: rivers.near(chunks, CHUNK_RIVER_MARGIN),
    ways: ways.near(chunks, CHUNK_WAY_MARGIN),
  });
  return {
    spawn,
    rivers,
    provinces,
    settlements,
    camps,
    peaks,
    caves,
    deepForests,
    ways,
    waysNearRegions,
    features,
    surface,
  };
};

export const createWorldgen = (seed: number): Worldgen => {
  const fields = createFields(seed);
  const world = createWorld(seed);
  const stages = createStages(seed, fields, world);
  const { spawn, rivers, provinces, camps, waysNearRegions, features } = stages;
  const caves = stages.caves.explore(world);
  const settlementsPlaced = placedOf(features.settlement);
  const buildingAt = (p: Vec2) =>
    world
      .gather(settlementsPlaced, boundsOf([p], features.settlement.reach))
      .flatMap(({ layout }) => layout.buildingsAt(p))
      .find(({ bounds }) => contains(bounds, p));
  const climb = storeyLinks(buildingAt);

  return {
    seed,
    fields,
    spawn,
    world,
    caves,
    stages,
    riversNear: (region) => world.read(rivers.near(regions), region),
    campAt: (region) => world.read(camps, region)[0],
    waysNear: (region) => world.read(waysNearRegions, region),
    deepForestsIn: (region) => world.read(placedOf(features.deepForest), region),
    caveMouthsIn: caves.openingsIn,
    mineEntrancesIn: caves.entrancesIn,
    mineYardsIn: (region) => world.read(placedOf(features.mineYard), region),
    settlementsIn: (region) => world.read(placedOf(features.settlement), region),
    caveFloorOf: caves.layerFloor,
    linkAcross: (layer, from, to) => {
      if (isStorey(layer)) return climb(layer, from, to);
      if (layer === SURFACE) return climb(layer, from, to) ?? caves.linkAcross(layer, from, to);
      return caves.linkAcross(layer, from, to);
    },
    buildingAt,
    provinceAt: (p) => provinces.provinceAt(world, p),
    provincesAround: (p) => provinces.seatsAround(world, p),
  };
};

export const generateChunk = ({ world, stages }: Worldgen, cx: number, cy: number): Chunk =>
  world.read(stages.surface, { col: cx, row: cy });

export const chunkOn = (worldgen: Worldgen, layer: Layer, cx: number, cy: number): Chunk => {
  if (layer === SURFACE) return generateChunk(worldgen, cx, cy);
  if (isStorey(layer)) return storeyChunk(generateChunk(worldgen, cx, cy), worldgen.buildingAt(layer.building), layer);
  return floorChunk(worldgen.seed, worldgen.caveFloorOf(layer), layer, cx, cy);
};
