import {
  type Point,
  clamp,
  createNoise,
  distance,
  hash,
  hashString,
  intBetween,
  memoize,
  projectOntoSegment,
  relativeNeighbours,
} from "../../lib";
import { MAX_CLIMB, heightLevel } from "../constants";
import type { Fields } from "../fields";
import { route } from "../routing";
import { CEILING, RAMP_LINK, type createCavePlans } from "./plan";
import type { Junction } from "./junctions";
import { type Cave, TERRITORY_RADIUS } from "./siting";

export type FloorMark = "slope" | "down" | "up" | "exit";

export interface FloorLayout {
  readonly isOpen: (p: Point) => boolean;
  readonly isChamber: (p: Point) => boolean;
  readonly levelAt: (p: Point) => number;
  readonly markAt: (p: Point) => FloorMark | undefined;
  readonly openTiles: () => Point[];
}

export interface CaveFloorInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly caveOwning: (p: Point) => Cave | undefined;
  readonly plans: ReturnType<typeof createCavePlans>;
  readonly junctionsOf: (cave: Cave) => readonly Junction[];
}

const SALT = hashString("cave floors");
const SIDE = 2 * TERRITORY_RADIUS + 1;
const ROCK = 0;
const TUNNEL = 1;
const CHAMBER = 2;
const UNKNOWN = -1;
const CHAMBER_GRID = 8;
const GRID_COLUMNS = Math.ceil(SIDE / CHAMBER_GRID);
const CHAMBER_GAP = 20;
const TILES_PER_CHAMBER = 1600;
const CHAMBER_COUNTS = [2, 8] as const;
const CHAMBER_RADII = [4, 9] as const;
const CHAMBER_ROUGHNESS = 0.35;
const ROUGHNESS_SCALE = 5;
const CENTRELINE = 0.75;
const TUNNEL_HALF_WIDTH = 1.2;
const WOBBLE = 1.2;
const WOBBLE_SCALE = 10;
const ROUTE_MARGIN = 24;
const FLOOR_CACHE = 64;

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const tileCentre = (p: Point): Point => ({ x: p.x + 0.5, y: p.y + 0.5 });

export const createCaveFloors = ({ seed, fields, caveOwning, plans, junctionsOf }: CaveFloorInput) => {
  const roughness = createNoise(seed, SALT);
  const wobble = createNoise(seed, hash(SALT, 1));

  const build = (cave: Cave, floor: number): FloorLayout => {
    const plan = plans.planOf(cave);
    const base = plan.baseOf(floor);
    const [minX, minY] = [cave.x - TERRITORY_RADIUS, cave.y - TERRITORY_RADIUS];
    const indexOf = ({ x, y }: Point) =>
      x < minX || y < minY || x >= minX + SIDE || y >= minY + SIDE ? -1 : (y - minY) * SIDE + (x - minX);
    const pointOf = (i: number): Point => ({ x: minX + (i % SIDE), y: minY + Math.floor(i / SIDE) });

    const kinds = new Uint8Array(SIDE * SIDE);
    const levels = new Int16Array(SIDE * SIDE).fill(base);
    const allowance = new Int8Array(SIDE * SIDE).fill(UNKNOWN);

    const below = floor > plan.bottom ? plans.rampBelow(cave, floor) : undefined;
    const above = floor < plan.top ? plans.rampBelow(cave, floor + 1) : undefined;
    const junctions = junctionsOf(cave).filter((j) => j.floor === floor);
    const junctionsBesides = junctionsOf(cave).filter((j) => Math.abs(j.floor - floor) === 1);
    const ownSlopes = [
      ...(below?.tiles.slice(0, RAMP_LINK) ?? []),
      ...(above?.tiles.slice(RAMP_LINK) ?? []),
      ...junctions.flatMap((j) => j.tiles),
    ];
    const foreignSlopes = [
      ...(below?.tiles.slice(RAMP_LINK) ?? []),
      ...(above?.tiles.slice(0, RAMP_LINK) ?? []),
      ...junctionsBesides.flatMap((j) => j.tiles),
    ];
    const passage = floor === 0 ? plan.mouth.passage : [];
    const ends = [
      ...(passage[0] ? [passage[0]] : []),
      ...(below ? [below.tiles[0]!] : []),
      ...(above ? [above.tiles.at(-1)!] : []),
      ...junctions.map((j) => j.tiles.at(-1)!),
    ];
    const rampInterior = new Set(ownSlopes.filter((t) => !ends.includes(t)).map(indexOf));
    const excluded = new Set(
      foreignSlopes.flatMap((t) =>
        [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => indexOf({ x: t.x + dx, y: t.y + dy }))),
      ),
    );

    const isBlocked = (i: number) => i < 0 || excluded.has(i) || rampInterior.has(i);
    const isAllowed = (p: Point) => {
      const i = indexOf(p);
      if (isBlocked(i)) return false;
      if (allowance[i] === UNKNOWN)
        allowance[i] =
          caveOwning(p)?.id === cave.id && heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5)) >= base + CEILING
            ? 1
            : 0;
      return allowance[i] === 1;
    };
    const carve = (p: Point, kind: number) => {
      const i = indexOf(p);
      if (i >= 0) kinds[i] = Math.max(kinds[i]!, kind);
    };

    const grid = Array.from({ length: GRID_COLUMNS * GRID_COLUMNS }, (_, i) => ({
      x: minX + (i % GRID_COLUMNS) * CHAMBER_GRID,
      y: minY + Math.floor(i / GRID_COLUMNS) * CHAMBER_GRID,
    })).filter(isAllowed);
    const count = clamp(Math.round((grid.length * CHAMBER_GRID * CHAMBER_GRID) / TILES_PER_CHAMBER), ...CHAMBER_COUNTS);
    const chambers: Point[] = [];
    const shuffled = grid
      .map((p) => ({ p, order: hash(seed, SALT, cave.id, floor, p.x, p.y) }))
      .sort((a, b) => a.order - b.order);
    for (const { p } of shuffled) {
      if (chambers.length >= count) break;
      if ([...chambers, ...ends].every((c) => distance(c, p) >= CHAMBER_GAP)) chambers.push(p);
    }

    for (const centre of chambers) {
      const radius = intBetween(...CHAMBER_RADII, hash(seed, SALT, cave.id, floor, centre.x, centre.y, 1));
      for (let y = centre.y - radius - 3; y <= centre.y + radius + 3; y++)
        for (let x = centre.x - radius - 3; x <= centre.x + radius + 3; x++) {
          const p = { x, y };
          const shape =
            distance(tileCentre(p), tileCentre(centre)) / radius +
            CHAMBER_ROUGHNESS * roughness(x / ROUGHNESS_SCALE, y / ROUGHNESS_SCALE);
          if (shape < 1 && isAllowed(p)) carve(p, CHAMBER);
        }
    }

    const nodes = [...ends, ...chambers];
    const edges = nodes.flatMap((a, i) =>
      relativeNeighbours(a, nodes)
        .filter((b) => nodes.indexOf(b) > i)
        .map((b) => [a, b] as const),
    );
    const isOwned = (p: Point) => !isBlocked(indexOf(p)) && caveOwning(p)?.id === cave.id;
    const isUnderground = (p: Point) => isOwned(p) && heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5)) >= base;
    const tunnelBetween = (a: Point, b: Point) =>
      [isAllowed, isUnderground, isOwned].reduce<Point[] | undefined>(
        (found, isOpen) =>
          found ??
          route(a, b, {
            gradeLevel: () => base,
            isOpen: (p) => isOpen({ x: Math.floor(p.x), y: Math.floor(p.y) }),
            unitCost: (_, at) => 1 + WOBBLE * (1 + wobble(at.x / WOBBLE_SCALE, at.y / WOBBLE_SCALE)),
            typicalUnitCost: 1 + WOBBLE,
            margin: ROUTE_MARGIN,
          }),
        undefined,
      );
    for (const [a, b] of edges) {
      const path = tunnelBetween(a, b);
      if (!path) continue;
      const points = [a, ...path.slice(1, -1), b].map(tileCentre);
      points.forEach((from, k) => {
        const to = points[k + 1];
        if (!to) return;
        for (let y = Math.floor(Math.min(from.y, to.y) - 2); y <= Math.max(from.y, to.y) + 2; y++)
          for (let x = Math.floor(Math.min(from.x, to.x) - 2); x <= Math.max(from.x, to.x) + 2; x++) {
            const gap = projectOntoSegment(tileCentre({ x, y }), from, to).distance;
            const isCentre = gap <= CENTRELINE && !isBlocked(indexOf({ x, y }));
            if (isCentre || (gap <= TUNNEL_HALF_WIDTH && isAllowed({ x, y }))) carve({ x, y }, TUNNEL);
          }
      });
    }

    for (const p of [...passage, ...ends]) carve(p, TUNNEL);
    for (const i of excluded) if (i >= 0) kinds[i] = ROCK;
    for (const t of ownSlopes) {
      carve(t, TUNNEL);
      levels[indexOf(t)] = t.level;
    }

    const kindAt = (p: Point) => {
      const i = indexOf(p);
      return i < 0 ? ROCK : kinds[i]!;
    };
    const step = (from: number, to: number) => Math.abs(levels[from]! - levels[to]!) <= MAX_CLIMB;
    const spread = (starts: readonly number[], canEnter: (from: number, to: number) => boolean) => {
      const cameFrom = new Map(starts.map((i) => [i, i]));
      const frontier = [...starts];
      for (let k = 0; k < frontier.length; k++) {
        const i = frontier[k]!;
        for (const o of NEIGHBOURS) {
          const n = indexOf({ x: pointOf(i).x + o.x, y: pointOf(i).y + o.y });
          if (n < 0 || cameFrom.has(n) || !canEnter(i, n)) continue;
          cameFrom.set(n, i);
          frontier.push(n);
        }
      }
      return cameFrom;
    };
    const isWalkable = (from: number, to: number) => kinds[to] !== ROCK && step(from, to);
    let reached = spread([indexOf(ends[0] ?? cave)], isWalkable);
    for (const end of ends.map(indexOf).filter((i) => !reached.has(i))) {
      const toward = spread([end], (from, to) => (reached.has(to) && step(from, to)) || isOwned(pointOf(to)));
      const meeting = [...toward.keys()].find((i) => reached.has(i));
      for (let i = meeting; i !== undefined && i !== end; i = toward.get(i)) carve(pointOf(i), TUNNEL);
      reached = spread([indexOf(ends[0]!)], isWalkable);
    }
    const marks = new Map<number, FloorMark>([
      ...passage.slice(-1).map((t) => [indexOf(t), "exit"] as const),
      ...(below?.tiles.slice(0, RAMP_LINK) ?? []).map(
        (t, i) => [indexOf(t), i === RAMP_LINK - 1 ? "down" : "slope"] as const,
      ),
      ...(above?.tiles.slice(RAMP_LINK) ?? []).map((t, i) => [indexOf(t), i === 0 ? "up" : "slope"] as const),
    ]);
    return {
      markAt: (p) => marks.get(indexOf(p)),
      isOpen: (p) => kindAt(p) !== ROCK,
      isChamber: (p) => kindAt(p) === CHAMBER,
      levelAt: (p) => {
        const i = indexOf(p);
        return i < 0 ? base : levels[i]!;
      },
      openTiles: () =>
        Array.from(kinds.keys())
          .filter((i) => kinds[i] !== ROCK)
          .map(pointOf),
    };
  };

  const floorOf = memoize(
    ({ cave, floor }: { cave: Cave; floor: number }) => build(cave, floor),
    ({ cave, floor }) => `${cave.id}:${floor}`,
    FLOOR_CACHE,
  );

  return { floorOf: (cave: Cave, floor: number) => floorOf({ cave, floor }) };
};
