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
import { MACRO_SIZE, MAX_CLIMB, heightLevel } from "./constants";
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

export interface Cell {
  readonly cx: number;
  readonly cy: number;
}

export interface Worldgen {
  readonly seed: number;
  readonly fields: Fields;
  readonly spawn: Camp;
  readonly cellOf: (p: Point) => Cell;
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
const LINK_CELL_RADIUS = 2;
const ROAD_WOBBLE_SCALE = 48;
const ROAD_TYPICAL_COST = 2;
const CELL_CACHE = 4096;
const TRAIL_SALT = hashString("trails");
const MAX_TRAILS_PER_LANDMARK = 5;
const TRAIL_DIFFICULTY = 1.2;
const TRAIL_DIFFICULTY_SCALE = 60;
const TRAIL_REUSE = 0.35;
const TRAIL_TYPICAL_COST = 2.5;
const STEEP_PENALTY = 25;

const RIVER_CELL_RADIUS = Math.ceil(MAX_RIVER_REACH / MACRO_SIZE) + 1;
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

const cellKey = ({ cx, cy }: Cell) => `${cx},${cy}`;
const pointKey = ({ x, y }: Point) => `${x},${y}`;

const isForward = (from: Cell, to: Cell) => to.cy > from.cy || (to.cy === from.cy && to.cx > from.cx);

const climbCost = (grade: number) => (grade <= MAX_CLIMB ? grade : STEEP_PENALTY * grade);

const LandmarkKind = { Camp: 0, Glade: 1, Peak: 2 } as const;
type LandmarkKind = (typeof LandmarkKind)[keyof typeof LandmarkKind];

interface Landmark extends Point {
  readonly cell: Cell;
  readonly kind: LandmarkKind;
}

const isTrailhead = (l: Landmark) => l.kind !== LandmarkKind.Camp;

const ownsLink = (head: Landmark, target: Landmark) =>
  !isTrailhead(target) ||
  isForward(head.cell, target.cell) ||
  (head.cell.cx === target.cell.cx && head.cell.cy === target.cell.cy && target.kind > head.kind);

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

const cellBounds = ({ cx, cy }: Cell): Bounds => ({
  minX: cx * MACRO_SIZE,
  minY: cy * MACRO_SIZE,
  maxX: (cx + 1) * MACRO_SIZE,
  maxY: (cy + 1) * MACRO_SIZE,
});

const overlaps = (a: Bounds, b: Bounds) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

const cellsAround = ({ cx, cy }: Cell, radius: number): Cell[] => {
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
  const biomeAt = (p: Point) => biomeOf(fields.climate(p.x, p.y));
  const cellOf = (p: Point): Cell => ({
    cx: floorDiv(p.x, MACRO_SIZE),
    cy: floorDiv(p.y, MACRO_SIZE),
  });

  const tracedRiver = memoize(
    (cell: Cell) => {
      const river = traceRiver(seed, fields, cell.cx, cell.cy);
      return (
        river && {
          river,
          bounds: boundsOf(river.nodes, (river.lake?.radius ?? 0) + 8),
        }
      );
    },
    cellKey,
    CELL_CACHE,
  );

  const riversNearCell = memoize(
    (cell: Cell) =>
      cellsAround(cell, RIVER_CELL_RADIUS).flatMap((source) => {
        const traced = tracedRiver(source);
        return traced && overlaps(traced.bounds, cellBounds(cell)) ? [traced.river] : [];
      }),
    cellKey,
    CELL_CACHE,
  );

  const isCampSite = (p: Point): boolean => {
    const center = level(p);
    const biome = biomeAt(p);
    if (biome === Biome.Ocean || biome === Biome.Beach || biome === Biome.Mountain) return false;
    if (FLATNESS_PROBES.some((o) => Math.abs(level({ x: p.x + o.x, y: p.y + o.y }) - center) > CAMP_FLATNESS))
      return false;
    if (!seamFits(level, p)) return false;
    return riversNearCell(cellOf(p)).every((river) => riverDistance(river, p) > RIVER_CLEARANCE);
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
  const spawnCell = cellOf(spawn);

  const campAtCell = memoize(
    ({ cx, cy }: Cell): Camp | undefined => {
      if (cx === spawnCell.cx && cy === spawnCell.cy) return spawn;
      const nearSpawn = Math.abs(cx - spawnCell.cx) <= 1 && Math.abs(cy - spawnCell.cy) <= 1;
      if (!nearSpawn && unit(hash(seed, CAMP_SALT, cx, cy)) > CAMP_CHANCE) return undefined;
      for (let attempt = 0; attempt < CAMP_ATTEMPTS; attempt++) {
        const p = {
          x:
            cx * MACRO_SIZE +
            intBetween(CAMP_MARGIN, MACRO_SIZE - CAMP_MARGIN, hash(seed, CAMP_SALT, cx, cy, attempt, 1)),
          y:
            cy * MACRO_SIZE +
            intBetween(CAMP_MARGIN, MACRO_SIZE - CAMP_MARGIN, hash(seed, CAMP_SALT, cx, cy, attempt, 2)),
        };
        if (distance(p, spawn) > CAMP_SPACING && isCampSite(p)) return { ...p, id: hash(seed, CAMP_SALT, cx, cy) };
      }
      return undefined;
    },
    cellKey,
    CELL_CACHE,
  );
  const campAt = (cx: number, cy: number) => campAtCell({ cx, cy });

  const routeRoad = (from: Camp, to: Camp) =>
    route(
      level,
      from,
      to,
      (grade, at) => {
        const wobble = 0.6 * (1 + roadNoise(at.x / ROAD_WOBBLE_SCALE, at.y / ROAD_WOBBLE_SCALE));
        return 1 + wobble + climbCost(grade);
      },
      ROAD_TYPICAL_COST,
    );

  const roadsFromCell = memoize(
    (cell: Cell): Road[] => {
      const from = campAtCell(cell);
      if (!from) return [];
      const camps = cellsAround(cell, LINK_CELL_RADIUS).flatMap((c) => {
        const camp = campAtCell(c);
        return camp ? [{ x: camp.x, y: camp.y, camp, cell: c }] : [];
      });
      return relativeNeighbours(from, camps)
        .filter((candidate) => isForward(cell, candidate.cell))
        .flatMap(({ camp: to }) => {
          const nodes = routeRoad(from, to);
          return nodes ? [{ from, to, nodes }] : [];
        });
    },
    cellKey,
    CELL_CACHE,
  );
  const roadsFrom = (cx: number, cy: number) => roadsFromCell({ cx, cy });

  const roadsNearCell = memoize(
    (cell: Cell) =>
      cellsAround(cell, LINK_CELL_RADIUS)
        .flatMap(roadsFromCell)
        .filter((road) => overlaps(boundsOf(road.nodes, 8), cellBounds(cell))),
    cellKey,
    CELL_CACHE,
  );

  const gladeOf = memoize((cell: Cell) => findGlade(seed, fields, cell.cx, cell.cy), cellKey, CELL_CACHE);
  const peakOf = memoize((cell: Cell) => findPeak(fields, cell.cx, cell.cy), cellKey, CELL_CACHE);

  const landmarksIn = (cell: Cell): Landmark[] =>
    (
      [
        [campAtCell(cell), LandmarkKind.Camp],
        [gladeOf(cell), LandmarkKind.Glade],
        [peakOf(cell), LandmarkKind.Peak],
      ] as const
    ).flatMap(([p, kind]) => (p ? [{ x: p.x, y: p.y, cell, kind }] : []));

  const trailLevel = (p: Point) => heightLevel(fields.elevationBeforeLedges(p.x, p.y));

  const trailsFromCell = memoize(
    (cell: Cell): Trail[] => {
      const candidates = cellsAround(cell, 1).flatMap(landmarksIn);
      const walked = new Set(roadsNearCell(cell).flatMap((road) => road.nodes.map(pointKey)));
      const unitCost = (grade: number, at: Point) => {
        const difficulty =
          TRAIL_DIFFICULTY * (1 + trailNoise(at.x / TRAIL_DIFFICULTY_SCALE, at.y / TRAIL_DIFFICULTY_SCALE));
        return (1 + difficulty + climbCost(grade)) * (walked.has(pointKey(at)) ? TRAIL_REUSE : 1);
      };
      return landmarksIn(cell)
        .filter(isTrailhead)
        .flatMap((head) => {
          const count = countBiasedLow(MAX_TRAILS_PER_LANDMARK, hash(seed, TRAIL_SALT, cell.cx, cell.cy, head.kind));
          return relativeNeighbours(head, candidates)
            .filter((target) => ownsLink(head, target))
            .sort((a, b) => distance(head, a) - distance(head, b))
            .slice(0, count)
            .flatMap((target) => {
              const nodes = route(trailLevel, head, target, unitCost, TRAIL_TYPICAL_COST);
              nodes?.forEach((node) => walked.add(pointKey(node)));
              return nodes ? [{ nodes }] : [];
            });
        });
    },
    cellKey,
    CELL_CACHE,
  );

  const trailsNearCell = memoize(
    (cell: Cell) =>
      cellsAround(cell, 2)
        .flatMap(trailsFromCell)
        .filter((trail) => overlaps(boundsOf(trail.nodes, 8), cellBounds(cell))),
    cellKey,
    CELL_CACHE,
  );

  const gladesNearCell = memoize(
    (cell: Cell) =>
      cellsAround(cell, 1).flatMap((source) => {
        const glade = gladeOf(source);
        return glade && overlaps(boundsOf([glade], glade.radius), cellBounds(cell)) ? [glade] : [];
      }),
    cellKey,
    CELL_CACHE,
  );

  return {
    seed,
    fields,
    spawn,
    cellOf,
    riversNear: (cx, cy) => riversNearCell({ cx, cy }),
    campAt,
    roadsFrom,
    roadsNear: (cx, cy) => roadsNearCell({ cx, cy }),
    trailsNear: (cx, cy) => trailsNearCell({ cx, cy }),
    gladesNear: (cx, cy) => gladesNearCell({ cx, cy }),
  };
};
