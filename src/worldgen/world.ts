import {
  type Point,
  countBiasedLow,
  createNoise,
  distance,
  floorDiv,
  hash,
  hashString,
  intBetween,
  memoize,
  projectOntoSegment,
  relativeNeighbours,
  unit,
} from "../lib";
import { biomeOf } from "./biome";
import { seamFits } from "./camp";
import { REGION_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import { type Fields, createFields } from "./fields";
import { MAX_RIVER_REACH, type River, traceRiver } from "./rivers";
import { route } from "./routing";
import { type Glade, type Trail, findGlade, findPeak } from "./trails";
import { Biome } from "./terrain";

export interface Camp extends Point {
  readonly id: number;
}

export interface Road {
  readonly from: Camp;
  readonly to: Camp;
  readonly nodes: readonly Point[];
}

export interface Region {
  readonly cx: number;
  readonly cy: number;
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
}

const CAMP_SPACING = 120;

const CAMP_SALT = hashString("camps");
const ROAD_SALT = hashString("roads");
const CAMP_CHANCE = 0.55;
const CAMP_ATTEMPTS = 4;
const CAMP_MARGIN = 32;
const CAMP_FLATNESS = 8;
const RIVER_CLEARANCE = 10;
const SPAWN_SEARCH_STEP = 16;
const SPAWN_SEARCH_RINGS = 60;
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
const FLATNESS_PROBES: readonly Point[] = [
  { x: 6, y: 0 },
  { x: -6, y: 0 },
  { x: 0, y: 6 },
  { x: 0, y: -6 },
  { x: 4, y: 4 },
  { x: -4, y: 4 },
  { x: 4, y: -4 },
  { x: -4, y: -4 },
];

const regionKey = ({ cx, cy }: Region) => `${cx},${cy}`;
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

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const boundsOf = (points: readonly Point[], margin: number): Bounds => ({
  minX: Math.min(...points.map((p) => p.x)) - margin,
  minY: Math.min(...points.map((p) => p.y)) - margin,
  maxX: Math.max(...points.map((p) => p.x)) + margin,
  maxY: Math.max(...points.map((p) => p.y)) + margin,
});

const regionBounds = ({ cx, cy }: Region): Bounds => ({
  minX: cx * REGION_SIZE,
  minY: cy * REGION_SIZE,
  maxX: (cx + 1) * REGION_SIZE,
  maxY: (cy + 1) * REGION_SIZE,
});

const overlaps = (a: Bounds, b: Bounds) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

const regionsAround = ({ cx, cy }: Region, radius: number): Region[] => {
  const side = 2 * radius + 1;
  return Array.from({ length: side * side }, (_, i) => ({
    cx: cx - radius + (i % side),
    cy: cy - radius + Math.floor(i / side),
  }));
};

const riverDistance = (river: River, p: Point): number => {
  const lakeGap = river.lake ? distance(p, river.lake) - river.lake.radius : Infinity;
  return river.nodes.reduce((nearest, node, i) => {
    const next = river.nodes[i + 1];
    if (!next) return nearest;
    return Math.min(nearest, projectOntoSegment(p, node, next).distance - next.halfWidth);
  }, lakeGap);
};

export const createWorldgen = (seed: number): Worldgen => {
  const fields = createFields(seed);
  const roadNoise = createNoise(seed, ROAD_SALT);
  const trailNoise = createNoise(seed, TRAIL_SALT);
  const level = (p: Point) => heightLevel(fields.elevation(p.x, p.y));
  const isDry = (p: Point) => level(p) > SEA_LEVEL;
  const biomeAt = (p: Point) => biomeOf(fields.climate(p.x, p.y));
  const regionOf = (p: Point): Region => ({
    cx: floorDiv(p.x, REGION_SIZE),
    cy: floorDiv(p.y, REGION_SIZE),
  });

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

  const isCampSite = (p: Point): boolean => {
    const center = level(p);
    const biome = biomeAt(p);
    if (biome === Biome.Ocean || biome === Biome.Beach || biome === Biome.Mountain) return false;
    if (FLATNESS_PROBES.some((o) => Math.abs(level({ x: p.x + o.x, y: p.y + o.y }) - center) > CAMP_FLATNESS))
      return false;
    if (!seamFits(level, p)) return false;
    return riversNearRegion(regionOf(p)).every((river) => riverDistance(river, p) > RIVER_CLEARANCE);
  };

  const findSpawn = (): Camp => {
    for (let ring = 0; ring <= SPAWN_SEARCH_RINGS; ring++)
      for (let i = 0; i < Math.max(1, ring * 8); i++) {
        const side = Math.floor(i / Math.max(1, ring * 2));
        const along = (i % Math.max(1, ring * 2)) - ring;
        const [gx, gy] = [
          [along, -ring],
          [ring, along],
          [-along, ring],
          [-ring, -along],
        ][side]!;
        const p = { x: gx! * SPAWN_SEARCH_STEP, y: gy! * SPAWN_SEARCH_STEP };
        if (isCampSite(p)) return { ...p, id: hash(seed, CAMP_SALT, p.x, p.y) };
      }
    return { x: 0, y: 0, id: hash(seed, CAMP_SALT) };
  };

  const spawn = findSpawn();
  const spawnRegion = regionOf(spawn);

  const campAtRegion = memoize(
    ({ cx, cy }: Region): Camp | undefined => {
      if (cx === spawnRegion.cx && cy === spawnRegion.cy) return spawn;
      const nearSpawn = Math.abs(cx - spawnRegion.cx) <= 1 && Math.abs(cy - spawnRegion.cy) <= 1;
      if (!nearSpawn && unit(hash(seed, CAMP_SALT, cx, cy)) > CAMP_CHANCE) return undefined;
      for (let attempt = 0; attempt < CAMP_ATTEMPTS; attempt++) {
        const p = {
          x:
            cx * REGION_SIZE +
            intBetween(CAMP_MARGIN, REGION_SIZE - CAMP_MARGIN, hash(seed, CAMP_SALT, cx, cy, attempt, 1)),
          y:
            cy * REGION_SIZE +
            intBetween(CAMP_MARGIN, REGION_SIZE - CAMP_MARGIN, hash(seed, CAMP_SALT, cx, cy, attempt, 2)),
        };
        if (distance(p, spawn) > CAMP_SPACING && isCampSite(p)) return { ...p, id: hash(seed, CAMP_SALT, cx, cy) };
      }
      return undefined;
    },
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
  };
};
