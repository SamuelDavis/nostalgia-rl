import { type Point, memoize } from "../lib";
import { biomeOf } from "./biome";
import { type Camp, createCamps } from "./features/camp";

export type { Camp } from "./features/camp";
export type { DeepForestLayout } from "./features/deep-forest";
import { type DeepForestLayout, createDeepForests } from "./features/deep-forest";
import { type Anchor, type FeatureType, type PlacedFeature, place } from "./features/feature";
import { REGION_SIZE, heightLevel } from "./constants";
import { type Fields, createFields } from "./fields";
import { type River, createRivers } from "./rivers";
import { type Bounds, type Region, overlaps, regionBounds, regionKey, regionsAround } from "./region";
import { findPeak } from "./landmarks";
import { type WayLink, createWayness, createWays } from "./ways";
import { createCaves } from "./caves/caves";
import type { FloorLayout } from "./caves/floor";
import type { Opening } from "./features/deep-forest";
import type { CaveFloor, Layer } from "./layer";

export interface Worldgen {
  readonly seed: number;
  readonly fields: Fields;
  readonly spawn: Camp;
  readonly riversNear: (region: Region) => readonly River[];
  readonly campAt: (region: Region) => Camp | undefined;
  readonly waysNear: (region: Region) => readonly WayLink[];
  readonly deepForestsIn: (region: Region) => readonly PlacedFeature<DeepForestLayout>[];
  readonly featuresNear: (region: Region) => readonly PlacedFeature[];
  readonly caveMouthsIn: (region: Region) => readonly Opening[];
  readonly mineEntrancesIn: (region: Region) => readonly Opening[];
  readonly caveFloorOf: (layer: CaveFloor) => FloorLayout | undefined;
  readonly linkAcross: (layer: Layer, from: Point, to: Point) => Layer | undefined;
}

const REGION_CACHE = 4096;
export const createWorldgen = (seed: number): Worldgen => {
  const fields = createFields(seed);
  const level = (p: Point) => heightLevel(fields.elevation(p.x, p.y));
  const biomeAt = (p: Point) => biomeOf(fields.conditions(p.x, p.y));

  const rivers = createRivers(seed, fields);
  const riversNearRegion = rivers.near;

  const camps = createCamps({
    seed,
    level,
    biomeAt,
    riversNear: rivers.bandsNear,
    waysNear: (region) => ways.near(region),
  });
  const { spawn } = camps;
  const campAtRegion = camps.at;

  const placer = <A extends Anchor, L>(type: FeatureType<A, L>, anchorsIn: (region: Region) => readonly A[]) => {
    const placed = memoize(
      (anchor: A) => place(type, anchor),
      (anchor) => `${anchor.x},${anchor.y}`,
      REGION_CACHE,
    );
    return {
      reach: type.reach,
      placedIn: (region: Region, within?: Bounds): PlacedFeature<L>[] =>
        anchorsIn(region)
          .filter((anchor) => !within || overlaps(type.bounds(anchor), within))
          .map(placed),
    };
  };

  const peakOf = memoize((region: Region) => findPeak(fields, region), regionKey, REGION_CACHE);
  const caves = createCaves({ seed, fields, peakOf, waynessAt: createWayness({ fields, campAt: campAtRegion }) });
  const ways = createWays({
    seed,
    fields,
    campAt: campAtRegion,
    peakOf,
    openingsIn: (region) => [
      ...deepForests.partsIn(region).flatMap(deepForests.guaranteedOpeningsOf),
      ...caves.openingsIn(region),
    ],
    entrancesIn: caves.entrancesIn,
  });

  const deepForests = createDeepForests({
    seed,
    level,
    forestness: (p) => fields.forestness(p.x, p.y),
    campAt: campAtRegion,
    waysNear: (region) => ways.near(region),
  });
  const campPlacer = placer(camps.type, (region) => {
    const camp = campAtRegion(region);
    return camp ? [camp] : [];
  });
  const deepForestPlacer = placer(deepForests.type, deepForests.partsIn);
  const caveMouthPlacer = placer(caves.type, caves.cavesIn);
  const placers: readonly {
    readonly reach: number;
    readonly placedIn: (region: Region, within: Bounds) => readonly PlacedFeature[];
  }[] = [deepForestPlacer, campPlacer, caveMouthPlacer];

  const featuresNearRegion = memoize(
    (region: Region): PlacedFeature[] =>
      placers
        .flatMap(({ reach, placedIn }) =>
          regionsAround(region, Math.ceil(reach / REGION_SIZE)).flatMap((source) => [
            ...placedIn(source, regionBounds(region)),
          ]),
        )
        .sort((a, b) => a.priority - b.priority),
    regionKey,
    REGION_CACHE,
  );

  return {
    seed,
    fields,
    spawn,
    riversNear: riversNearRegion,
    campAt: campAtRegion,
    waysNear: ways.near,
    deepForestsIn: (region) => deepForestPlacer.placedIn(region),
    featuresNear: featuresNearRegion,
    caveMouthsIn: caves.openingsIn,
    mineEntrancesIn: caves.entrancesIn,
    caveFloorOf: caves.floorOf,
    linkAcross: caves.linkAcross,
  };
};
