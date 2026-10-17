import {
  type Point,
  countBiasedLow,
  createNoise,
  distance,
  hash,
  hashString,
  memoize,
  relativeNeighbours,
} from "../lib";
import { biomeOf } from "./biome";
import { type Camp, createCamps } from "./features/camp";

export type { Camp } from "./features/camp";
import { type PlacedFeature, place } from "./features/feature";
import { REGION_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import { type Fields, createFields } from "./fields";
import { MAX_RIVER_REACH, type River, traceRiver } from "./rivers";
import { route } from "./routing";
import { type Region, boundsOf, overlaps, regionBounds, regionKey, regionOf, regionsAround } from "./region";
import { type Glade, type Trail, findGlade, findPeak } from "./trails";

export interface Road {
  readonly from: Camp;
  readonly to: Camp;
  readonly nodes: readonly Point[];
}

export interface Worldgen {
  readonly seed: number;
  readonly fields: Fields;
  readonly spawn: Camp;
  readonly regionOf: (p: Point) => Region;
  readonly riversNear: (cx: number, cy: number) => readonly River[];
  readonly campAt: (cx: number, cy: number) => Camp | undefined;
  readonly roadsFrom: (cx: number, cy: number) => readonly Road[];
  readonly roadsNear: (cx: number, cy: number) => readonly Road[];
  readonly trailsNear: (cx: number, cy: number) => readonly Trail[];
  readonly gladesNear: (cx: number, cy: number) => readonly Glade[];
  readonly featuresNear: (cx: number, cy: number) => readonly PlacedFeature[];
}

const ROAD_SALT = hashString("roads");
const LINK_REGION_RADIUS = 2;
const ROAD_WOBBLE_SCALE = 48;
const ROAD_TYPICAL_COST = 2;
const REGION_CACHE = 4096;
const TRAIL_SALT = hashString("trails");
const MAX_TRAILS_PER_LANDMARK = 5;
const TRAIL_DIFFICULTY = 1.2;
const TRAIL_DIFFICULTY_SCALE = 60;
const TRAIL_REUSE = 0.35;
const TRAIL_TYPICAL_COST = 2.5;
const STEEP_PENALTY = 25;

const RIVER_REGION_RADIUS = Math.ceil(MAX_RIVER_REACH / REGION_SIZE) + 1;

const pointKey = ({ x, y }: Point) => `${x},${y}`;

const isForward = (from: Region, to: Region) => to.cy > from.cy || (to.cy === from.cy && to.cx > from.cx);

const climbCost = (grade: number) => (grade <= MAX_CLIMB ? grade : STEEP_PENALTY * grade);

const LandmarkKind = { Camp: 0, Glade: 1, Peak: 2 } as const;
type LandmarkKind = (typeof LandmarkKind)[keyof typeof LandmarkKind];

interface Landmark extends Point {
  readonly region: Region;
  readonly kind: LandmarkKind;
}

const isTrailhead = (l: Landmark) => l.kind !== LandmarkKind.Camp;

const ownsLink = (head: Landmark, target: Landmark) =>
  !isTrailhead(target) ||
  isForward(head.region, target.region) ||
  (head.region.cx === target.region.cx && head.region.cy === target.region.cy && target.kind > head.kind);

export const createWorldgen = (seed: number): Worldgen => {
  const fields = createFields(seed);
  const roadNoise = createNoise(seed, ROAD_SALT);
  const trailNoise = createNoise(seed, TRAIL_SALT);
  const level = (p: Point) => heightLevel(fields.elevation(p.x, p.y));
  const isDry = (p: Point) => level(p) > SEA_LEVEL;
  const biomeAt = (p: Point) => biomeOf(fields.climate(p.x, p.y));

  const tracedRiver = memoize(
    (region: Region) => {
      const river = traceRiver(seed, fields, region.cx, region.cy);
      return (
        river && {
          river,
          bounds: boundsOf(river.nodes, (river.lake?.radius ?? 0) + 8),
        }
      );
    },
    regionKey,
    REGION_CACHE,
  );

  const riversNearRegion = memoize(
    (region: Region) =>
      regionsAround(region, RIVER_REGION_RADIUS).flatMap((source) => {
        const traced = tracedRiver(source);
        return traced && overlaps(traced.bounds, regionBounds(region)) ? [traced.river] : [];
      }),
    regionKey,
    REGION_CACHE,
  );

  const camps = createCamps({ seed, level, biomeAt, riversNear: riversNearRegion });
  const { spawn } = camps;
  const campAtRegion = camps.at;

  const placedCamp = memoize(
    (camp: Camp) => place(camps.type, camp),
    (camp) => `${camp.x},${camp.y}`,
    REGION_CACHE,
  );

  const featuresNearRegion = memoize(
    (region: Region): PlacedFeature[] =>
      regionsAround(region, Math.ceil(camps.type.reach / REGION_SIZE))
        .flatMap((source) => {
          const camp = campAtRegion(source);
          return camp ? [placedCamp(camp)] : [];
        })
        .filter((feature) => overlaps(boundsOf([feature.anchor], feature.reach), regionBounds(region)))
        .sort((a, b) => a.priority - b.priority),
    regionKey,
    REGION_CACHE,
  );

  const campAt = (cx: number, cy: number) => campAtRegion({ cx, cy });

  const routeRoad = (from: Camp, to: Camp) =>
    route(from, to, {
      gradeLevel: level,
      isOpen: isDry,
      unitCost: (grade, at) => {
        const wobble = 0.6 * (1 + roadNoise(at.x / ROAD_WOBBLE_SCALE, at.y / ROAD_WOBBLE_SCALE));
        return 1 + wobble + climbCost(grade);
      },
      typicalUnitCost: ROAD_TYPICAL_COST,
    });

  const roadsFromRegion = memoize(
    (region: Region): Road[] => {
      const from = campAtRegion(region);
      if (!from) return [];
      const camps = regionsAround(region, LINK_REGION_RADIUS).flatMap((c) => {
        const camp = campAtRegion(c);
        return camp ? [{ x: camp.x, y: camp.y, camp, region: c }] : [];
      });
      return relativeNeighbours(from, camps)
        .filter((candidate) => isForward(region, candidate.region))
        .flatMap(({ camp: to }) => {
          const nodes = routeRoad(from, to);
          return nodes ? [{ from, to, nodes }] : [];
        });
    },
    regionKey,
    REGION_CACHE,
  );
  const roadsFrom = (cx: number, cy: number) => roadsFromRegion({ cx, cy });

  const roadsNearRegion = memoize(
    (region: Region) =>
      regionsAround(region, LINK_REGION_RADIUS)
        .flatMap(roadsFromRegion)
        .filter((road) => overlaps(boundsOf(road.nodes, 8), regionBounds(region))),
    regionKey,
    REGION_CACHE,
  );

  const gladeOf = memoize((region: Region) => findGlade(seed, fields, region.cx, region.cy), regionKey, REGION_CACHE);
  const peakOf = memoize((region: Region) => findPeak(fields, region.cx, region.cy), regionKey, REGION_CACHE);

  const landmarksIn = (region: Region): Landmark[] =>
    (
      [
        [campAtRegion(region), LandmarkKind.Camp],
        [gladeOf(region), LandmarkKind.Glade],
        [peakOf(region), LandmarkKind.Peak],
      ] as const
    ).flatMap(([p, kind]) => (p ? [{ x: p.x, y: p.y, region, kind }] : []));

  const trailLevel = (p: Point) => heightLevel(fields.elevationBeforeLedges(p.x, p.y));

  const trailsFromRegion = memoize(
    (region: Region): Trail[] => {
      const candidates = regionsAround(region, 1).flatMap(landmarksIn);
      const walked = new Set(roadsNearRegion(region).flatMap((road) => road.nodes.map(pointKey)));
      const unitCost = (grade: number, at: Point) => {
        const difficulty =
          TRAIL_DIFFICULTY * (1 + trailNoise(at.x / TRAIL_DIFFICULTY_SCALE, at.y / TRAIL_DIFFICULTY_SCALE));
        return (1 + difficulty + climbCost(grade)) * (walked.has(pointKey(at)) ? TRAIL_REUSE : 1);
      };
      return landmarksIn(region)
        .filter(isTrailhead)
        .flatMap((head) => {
          const count = countBiasedLow(
            MAX_TRAILS_PER_LANDMARK,
            hash(seed, TRAIL_SALT, region.cx, region.cy, head.kind),
          );
          return relativeNeighbours(head, candidates)
            .filter((target) => ownsLink(head, target))
            .sort((a, b) => distance(head, a) - distance(head, b))
            .slice(0, count)
            .flatMap((target) => {
              const nodes = route(head, target, {
                gradeLevel: trailLevel,
                isOpen: isDry,
                unitCost,
                typicalUnitCost: TRAIL_TYPICAL_COST,
              });
              nodes?.forEach((node) => walked.add(pointKey(node)));
              return nodes ? [{ nodes }] : [];
            });
        });
    },
    regionKey,
    REGION_CACHE,
  );

  const trailsNearRegion = memoize(
    (region: Region) =>
      regionsAround(region, 2)
        .flatMap(trailsFromRegion)
        .filter((trail) => overlaps(boundsOf(trail.nodes, 8), regionBounds(region))),
    regionKey,
    REGION_CACHE,
  );

  const gladesNearRegion = memoize(
    (region: Region) =>
      regionsAround(region, 1).flatMap((source) => {
        const glade = gladeOf(source);
        return glade && overlaps(boundsOf([glade], glade.radius), regionBounds(region)) ? [glade] : [];
      }),
    regionKey,
    REGION_CACHE,
  );

  return {
    seed,
    fields,
    spawn,
    regionOf,
    riversNear: (cx, cy) => riversNearRegion({ cx, cy }),
    campAt,
    roadsFrom,
    roadsNear: (cx, cy) => roadsNearRegion({ cx, cy }),
    trailsNear: (cx, cy) => trailsNearRegion({ cx, cy }),
    gladesNear: (cx, cy) => gladesNearRegion({ cx, cy }),
    featuresNear: (cx, cy) => featuresNearRegion({ cx, cy }),
  };
};
