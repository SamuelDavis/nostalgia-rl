import { type Cell, type Placed, type Vec2, type World, createWorld, featuresNear, placedOf } from "procgen";
import { biomeOf } from "./biome";
import { type Explored, MOUTH_REACH, createCaves } from "./caves/caves";
import type { FloorLayout } from "./caves/floor";
import type { MineYard } from "./caves/yard";
import type { Cave } from "./caves/siting";
import { CHUNK_RIVER_MARGIN, CHUNK_WAY_MARGIN, type Chunk, chunks, createSurface, floorChunk } from "./chunk";
import { heightLevel } from "./constants";
import { type Camp, RIVER_CLEARANCE, campFeature, campSiting, createCampSites, findSpawn } from "./features/camp";
import { type DeepForest, type DeepForestLayout, OPENING_REACH, createDeepForests } from "./features/deep-forest";
import type { Opening, TileDraft } from "./features/feature";
import { type Fields, createFields } from "./fields";
import { type CaveFloor, type Layer, SURFACE } from "./layer";
import { createPeaks } from "./landmarks";
import { regions } from "./region";
import { type River, createRivers } from "./rivers";
import { CAMP_PULL_RANGE, type WayLink, createWayness, createWays } from "./ways";

export type { Camp } from "./features/camp";
export type { DeepForestLayout } from "./features/deep-forest";

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
  readonly caveFloorOf: (layer: CaveFloor) => FloorLayout | undefined;
  readonly linkAcross: (layer: Layer, from: Vec2, to: Vec2) => Layer | undefined;
}

const createStages = (seed: number, fields: Fields, world: World) => {
  const level = (p: Vec2) => heightLevel(fields.elevation(p.x, p.y));
  const biomeAt = (p: Vec2) => biomeOf(fields.conditions(p.x, p.y));

  const rivers = createRivers(seed, fields);
  const siting = campSiting({ level, biomeAt, riverBands: rivers.coursesNear(regions, RIVER_CLEARANCE) });
  const spawn = findSpawn(seed, world, siting);
  const camps = createCampSites(siting, spawn);
  const peaks = createPeaks(fields);
  const wayness = createWayness({ fields, camps });
  const caves = createCaves({
    seed,
    fields,
    peaks,
    waynessAt: wayness.at,
    waynessReads: [{ stage: camps, radius: CAMP_PULL_RANGE + MOUTH_REACH }],
  });
  const deepForests = createDeepForests({
    seed,
    level,
    forestness: (p) => fields.forestness(p.x, p.y),
    camps,
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
    caveMouth: caves.mouthFeature,
  };
  const featuresNearChunks = featuresNear("features near chunks", chunks, [
    features.deepForest,
    features.camp,
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
  return { spawn, rivers, camps, peaks, caves, deepForests, ways, waysNearRegions, features, surface };
};

export const createWorldgen = (seed: number): Worldgen => {
  const fields = createFields(seed);
  const world = createWorld(seed);
  const stages = createStages(seed, fields, world);
  const { spawn, rivers, camps, waysNearRegions, features } = stages;
  const caves = stages.caves.explore(world);

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
    caveFloorOf: caves.layerFloor,
    linkAcross: caves.linkAcross,
  };
};

export const generateChunk = ({ world, stages }: Worldgen, cx: number, cy: number): Chunk =>
  world.read(stages.surface, { col: cx, row: cy });

export const chunkOn = (worldgen: Worldgen, layer: Layer, cx: number, cy: number): Chunk =>
  layer === SURFACE
    ? generateChunk(worldgen, cx, cy)
    : floorChunk(worldgen.seed, worldgen.caveFloorOf(layer), layer, cx, cy);
