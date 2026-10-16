import {
  type Point,
  createNoise,
  distance,
  findPath,
  floorDiv,
  hash,
  hashString,
  intBetween,
  memoize,
  projectOntoSegment,
  unit,
} from "../lib";
import { classifyBiome } from "./biome";
import { MACRO_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import { type Fields, createFields } from "./fields";
import { MAX_RIVER_REACH, type River, traceRiver } from "./rivers";
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
const ROAD_STEP = 4;
const ROAD_MARGIN = 96;
const ROAD_LINKS: readonly (readonly [dx: number, dy: number, chance: number])[] = [
  [1, 0, 0.8],
  [0, 1, 0.8],
  [1, 1, 0.3],
  [1, -1, 0.3],
];
const CELL_CACHE = 4096;

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
  const level = (p: Point) => heightLevel(fields.elevation(p.x, p.y));
  const biomeAt = (p: Point) =>
    classifyBiome(fields.elevation(p.x, p.y), fields.temperature(p.x, p.y), fields.moisture(p.x, p.y));
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

  const routeRoad = (from: Camp, to: Camp): Point[] | undefined => {
    const bounds = boundsOf([from, to], ROAD_MARGIN);
    const toGrid = (v: number) => Math.round(v / ROAD_STEP);
    const goal = { x: toGrid(to.x), y: toGrid(to.y) };
    const levels = new Map<number, number>();
    const key = (g: Point) => g.x * 100_003 + g.y;
    const gridLevel = (g: Point) => {
      const k = key(g);
      if (!levels.has(k)) levels.set(k, level({ x: g.x * ROAD_STEP, y: g.y * ROAD_STEP }));
      return levels.get(k)!;
    };
    const inBounds = (g: Point) =>
      g.x * ROAD_STEP >= bounds.minX &&
      g.x * ROAD_STEP <= bounds.maxX &&
      g.y * ROAD_STEP >= bounds.minY &&
      g.y * ROAD_STEP <= bounds.maxY;
    const path = findPath<Point>({
      start: { x: toGrid(from.x), y: toGrid(from.y) },
      isGoal: (g) => g.x === goal.x && g.y === goal.y,
      neighbors: (g) =>
        [-1, 0, 1]
          .flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: g.x + dx, y: g.y + dy })))
          .filter((n) => (n.x !== g.x || n.y !== g.y) && inBounds(n) && gridLevel(n) >= SEA_LEVEL),
      cost: (a, b) => {
        const step = a.x !== b.x && a.y !== b.y ? Math.SQRT2 : 1;
        const slope = Math.abs(gridLevel(a) - gridLevel(b)) / (step * ROAD_STEP);
        const wobble = 0.6 * (1 + roadNoise(b.x / 12, b.y / 12));
        return step * (1 + wobble + (slope <= MAX_CLIMB ? slope : 25 * slope));
      },
      heuristic: (g) => distance(g, goal),
      keyOf: key,
    });
    return path?.map((g) => ({ x: g.x * ROAD_STEP, y: g.y * ROAD_STEP }));
  };

  const roadsFromCell = memoize(
    ({ cx, cy }: Cell): Road[] => {
      const from = campAt(cx, cy);
      if (!from) return [];
      return ROAD_LINKS.flatMap(([dx, dy, chance], link) => {
        const to = campAt(cx + dx, cy + dy);
        if (!to || unit(hash(seed, ROAD_SALT, cx, cy, link)) > chance) return [];
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
      cellsAround(cell, 2)
        .flatMap(roadsFromCell)
        .filter((road) => overlaps(boundsOf(road.nodes, 8), cellBounds(cell))),
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
  };
};
