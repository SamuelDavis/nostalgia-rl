import {
  type Point,
  clamp,
  createNoise,
  distance,
  hash,
  hashString,
  intBetween,
  lerp,
  MinHeap,
  memoize,
  projectOntoSegment,
} from "../lib";
import { REGION_SIZE, SEA_LEVEL, heightLevel, metresToLevels } from "./constants";
import type { Fields } from "./fields";
import { route } from "./routing";
import { type Region, regionKey } from "./region";

export interface RiverNode extends Point {
  readonly level: number;
  readonly halfWidth: number;
}

export interface Lake extends Point {
  readonly radius: number;
  readonly level: number;
}

export interface River {
  readonly nodes: readonly RiverNode[];
  readonly lake?: Lake;
}

interface Cell {
  readonly col: number;
  readonly row: number;
}

const SALT = hashString("rivers");
const CELL = 64;
const CELLS_PER_REGION = REGION_SIZE / CELL;
const NODE_MARGIN = 12;
const UPSTREAM_DEPTH = 12;
const RIVER_FLOW = 3;
const FLOW_PER_WIDTH = 8;
const MAX_HALF_WIDTH = 3;
const MEANDER = 0.6;
const MEANDER_SCALE = 40;
const UPHILL = 2;
const ROUTE_CACHE = 1 << 14;
const CHANNEL_MARGIN = 24;
const LAKE_RADII = [5, 12] as const;
const SPILL_RADIUS = 3;
const SPILL_SIDE = 2 * SPILL_RADIUS + 1;
const MAX_GORGE = metresToLevels(6);
const NEAR_CELLS = SPILL_RADIUS + 1;
const CELL_CACHE = 1 << 16;

const AROUND: readonly Cell[] = [
  { col: 1, row: 0 },
  { col: 1, row: 1 },
  { col: 0, row: 1 },
  { col: -1, row: 1 },
  { col: -1, row: 0 },
  { col: -1, row: -1 },
  { col: 0, row: -1 },
  { col: 1, row: -1 },
];

const cellKey = ({ col, row }: Cell) => `${col},${row}`;
const isSameCell = (a: Cell | undefined, b: Cell) => a !== undefined && a.col === b.col && a.row === b.row;
const neighboursOf = (c: Cell) => AROUND.map((o) => ({ col: c.col + o.col, row: c.row + o.row }));

const cellsAround = ({ rx, ry }: Region, ring: number): Cell[] => {
  const side = CELLS_PER_REGION + 2 * ring;
  return Array.from({ length: side * side }, (_, i) => ({
    col: rx * CELLS_PER_REGION - ring + (i % side),
    row: ry * CELLS_PER_REGION - ring + Math.floor(i / side),
  }));
};

export const createRivers = (seed: number, fields: Fields) => {
  const meander = createNoise(seed, SALT);
  const cached = <R>(compute: (c: Cell) => R) => memoize(compute, cellKey, CELL_CACHE);

  const nodeOf = cached(({ col, row }): Point => ({
    x: col * CELL + intBetween(NODE_MARGIN, CELL - NODE_MARGIN, hash(seed, SALT, col, row, 1)),
    y: row * CELL + intBetween(NODE_MARGIN, CELL - NODE_MARGIN, hash(seed, SALT, col, row, 2)),
  }));
  const drainageOf = cached((c) => fields.drainage(nodeOf(c).x, nodeOf(c).y));
  const groundOf = cached((c) => Math.max(SEA_LEVEL - 1, heightLevel(fields.elevation(nodeOf(c).x, nodeOf(c).y))));
  const rainOf = cached((c) => fields.moisture(nodeOf(c).x, nodeOf(c).y));
  const isSea = (c: Cell) => groundOf(c) < SEA_LEVEL;

  const fallOf = cached((c): Cell | undefined => {
    if (isSea(c)) return undefined;
    const lowest = neighboursOf(c).reduce((best, n) => (drainageOf(n) < drainageOf(best) ? n : best));
    return drainageOf(lowest) < drainageOf(c) ? lowest : undefined;
  });

  const drainsTo = cached((c): Cell | undefined => {
    const fall = fallOf(c);
    return fall && groundOf(fall) <= groundOf(c) ? fall : undefined;
  });

  const isBasin = (c: Cell) => !isSea(c) && !drainsTo(c);

  const spillOf = cached((basin: Cell): Cell[] | undefined => {
    if (!isBasin(basin)) return undefined;
    const limit = groundOf(basin) + MAX_GORGE;
    const cameFrom = new Map<string, Cell>([[cellKey(basin), basin]]);
    const open = new MinHeap<Cell>();
    open.push(basin, groundOf(basin));
    for (let c = open.pop(); c; c = open.pop()) {
      if (groundOf(c) < groundOf(basin)) {
        const path = [];
        for (let p = c; !isSameCell(p, basin); p = cameFrom.get(cellKey(p))!) path.push(p);
        return [basin, ...path.reverse()];
      }
      for (const n of neighboursOf(c)) {
        const isFar = Math.max(Math.abs(n.col - basin.col), Math.abs(n.row - basin.row)) > SPILL_RADIUS;
        if (isFar || cameFrom.has(cellKey(n)) || groundOf(n) > limit) continue;
        cameFrom.set(cellKey(n), c);
        open.push(n, groundOf(n));
      }
    }
    return undefined;
  });

  const spillsAround = (c: Cell) =>
    Array.from({ length: SPILL_SIDE * SPILL_SIDE }, (_, i) => ({
      col: c.col - SPILL_RADIUS + (i % SPILL_SIDE),
      row: c.row - SPILL_RADIUS + Math.floor(i / SPILL_SIDE),
    })).filter((b) => isSameCell(spillOf(b)?.at(-1), c));

  const upstreamOf = cached((c) => [...neighboursOf(c).filter((n) => isSameCell(drainsTo(n), c)), ...spillsAround(c)]);

  const flowWithin = (c: Cell, depth: number): number =>
    rainOf(c) + (depth === 0 ? 0 : upstreamOf(c).reduce((sum, u) => sum + flowWithin(u, depth - 1), 0));
  const flowOf = cached((c) => flowWithin(c, UPSTREAM_DEPTH));
  const isRiver = (c: Cell) => !isSea(c) && flowOf(c) >= RIVER_FLOW;

  const halfWidthOf = (c: Cell) => clamp(1 + Math.floor((flowOf(c) - RIVER_FLOW) / FLOW_PER_WIDTH), 1, MAX_HALF_WIDTH);

  const lakeAt = (c: Cell): Lake => {
    const { x, y } = nodeOf(c);
    return { x, y, level: groundOf(c), radius: intBetween(...LAKE_RADII, hash(seed, SALT, c.col, c.row, 3)) };
  };

  const levelAt = (p: Point) => Math.max(SEA_LEVEL - 1, heightLevel(fields.elevation(p.x, p.y)));

  const channel = (from: Cell, to: Cell, levels: readonly [number, number], halfWidth: number): RiverNode[] => {
    const [a, b] = [nodeOf(from), nodeOf(to)];
    const [source, mouth] = levels;
    const levelOf = memoize(levelAt, ({ x, y }) => `${x},${y}`, ROUTE_CACHE);
    const path = route(a, b, {
      gradeLevel: levelOf,
      isOpen: () => true,
      unitCost: (_, at) =>
        1 +
        MEANDER * (1 + meander(at.x / MEANDER_SCALE, at.y / MEANDER_SCALE)) +
        UPHILL * Math.max(0, levelOf(at) - source),
      typicalUnitCost: 2.5,
      margin: CHANNEL_MARGIN,
    });
    const points = [a, ...(path ?? []).slice(1, -1), b];
    const lengths = points.map((p, i) => distance(p, points[i - 1] ?? p));
    const total = lengths.reduce((sum, d) => sum + d, 0);
    let travelled = 0;
    let level = source;
    return points.map((p, i) => {
      travelled += lengths[i]!;
      const steady = lerp(source, mouth, travelled / total);
      level = Math.max(mouth, Math.min(level, steady, levelAt(p)));
      return { x: p.x, y: p.y, level, halfWidth };
    });
  };

  const courseOf = (c: Cell): Cell[] => {
    const to = drainsTo(c);
    return to ? [c, to] : (spillOf(c) ?? []);
  };

  const riverFrom = cached((c): River | undefined => {
    if (!isRiver(c)) return undefined;
    const course = courseOf(c);
    const halfWidth = halfWidthOf(c);
    const nodes = course.slice(1).flatMap((to, i) => {
      const isLast = i === course.length - 2;
      return channel(course[i]!, to, [groundOf(c), isLast ? groundOf(to) : groundOf(c)], halfWidth);
    });
    return { nodes, lake: isBasin(c) ? lakeAt(c) : undefined };
  });

  const bandFrom = cached((c): River | undefined => {
    if (!isRiver(c)) return undefined;
    const halfWidth = halfWidthOf(c) + CHANNEL_MARGIN;
    const nodes = courseOf(c).map((cell) => ({ ...nodeOf(cell), level: groundOf(cell), halfWidth }));
    return { nodes, lake: isBasin(c) ? lakeAt(c) : undefined };
  });

  const nearBy = (from: (c: Cell) => River | undefined) =>
    memoize(
      (region: Region): River[] => cellsAround(region, NEAR_CELLS).flatMap((c) => from(c) ?? []),
      regionKey,
      CELL_CACHE,
    );

  return { near: nearBy(riverFrom), bandsNear: nearBy(bandFrom) };
};

export const distanceToRiver = (river: River, p: Point): number => {
  const lakeGap = river.lake ? distance(p, river.lake) - river.lake.radius : Infinity;
  return river.nodes.reduce((nearest, node, i) => {
    const next = river.nodes[i + 1];
    if (!next) return nearest;
    return Math.min(nearest, projectOntoSegment(p, node, next).distance - next.halfWidth);
  }, lakeGap);
};
