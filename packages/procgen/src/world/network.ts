import {
  type Bounds,
  type Vec2,
  boundsOf,
  byPosition,
  distance,
  expand,
  overlaps,
  relativeNeighbours,
  within,
} from "../core/geometry";
import { findPath } from "../core/search";
import type { Grid } from "./grid";
import { type Dependency, type Stage, type StageContext, stage } from "./stage";

export interface Joint<E> {
  readonly edge: E;
  readonly path: readonly Vec2[];
}

export interface Link<N extends Vec2, E> extends Joint<E> {
  readonly from: N;
  readonly to: N;
  readonly bounds: Bounds;
}

export interface NetworkDefinition<N extends Vec2, E> {
  readonly name: string;
  readonly nodes: Stage<readonly N[]>;
  readonly reach: number;
  readonly reachOf?: (node: N) => number;
  readonly spread: number;
  readonly reads?: readonly Dependency[];
  readonly neighbours?: (node: N, candidates: readonly N[]) => readonly N[];
  readonly join: (from: N, to: N, context: StageContext) => Joint<E> | undefined;
}

export interface Network<N extends Vec2, E> {
  readonly owned: Stage<readonly Link<N, E>[]>;
  near(grid: Grid): Stage<readonly Link<N, E>[]>;
}

export const network = <N extends Vec2, E>({
  name,
  nodes,
  reach,
  reachOf = () => reach,
  spread,
  reads = [],
  neighbours = relativeNeighbours,
  join,
}: NetworkDefinition<N, E>): Network<N, E> => {
  const owned = stage({
    name: `${name} links`,
    grid: nodes.grid,
    reads: [{ stage: nodes, radius: reach }, ...reads],
    compute: (cell, context): readonly Link<N, E>[] => {
      const around = context.gather(nodes, expand(nodes.grid.boundsOf(cell), reach));
      return context.read(nodes, cell).flatMap((from) => {
        const candidates = around.filter((other) => distance(from, other) <= reach);
        return neighbours(from, candidates)
          .filter((to) => byPosition(from, to) < 0 && distance(from, to) <= Math.max(reachOf(from), reachOf(to)))
          .flatMap((to) => {
            const joint = join(from, to, context);
            if (!joint) return [];
            const bounds = boundsOf([from, to, ...joint.path]);
            if (!within(bounds, boundsOf([from, to], spread)))
              throw new Error(`Network "${name}" link from ${from.x},${from.y} strays beyond its spread ${spread}`);
            return [{ ...joint, from, to, bounds }];
          });
      });
    },
  });

  const nearStages = new Map<Grid, Stage<readonly Link<N, E>[]>>();
  const near = (grid: Grid) => {
    const existing = nearStages.get(grid);
    if (existing) return existing;
    const created = stage({
      name: `${name} links near ${grid.size}`,
      grid,
      reads: [{ stage: owned, radius: reach + spread }],
      compute: (cell, { gather }) => {
        const area = grid.boundsOf(cell);
        return gather(owned, expand(area, reach + spread)).filter(({ bounds }) => overlaps(bounds, area));
      },
    });
    nearStages.set(grid, created);
    return created;
  };

  return { owned, near };
};

export const KING_MOVES: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];
export const KNIGHT_MOVES: readonly Vec2[] = [
  ...KING_MOVES,
  ...[
    [1, 2],
    [2, 1],
    [-1, 2],
    [-2, 1],
    [1, -2],
    [2, -1],
    [-1, -2],
    [-2, -1],
  ].map(([x, y]) => ({ x: x!, y: y! })),
];

export interface GridRoute {
  readonly from: Vec2;
  readonly to: Vec2;
  readonly step: number;
  readonly margin: number;
  readonly cost: (from: Vec2, to: Vec2) => number;
  readonly heuristicCostPerUnit: number;
  readonly moves?: readonly Vec2[];
  readonly maxExpansions?: number;
}

export const routeOnGrid = ({
  from,
  to,
  step,
  margin,
  cost,
  heuristicCostPerUnit,
  moves = KNIGHT_MOVES,
  maxExpansions = 10_000,
}: GridRoute): Vec2[] | undefined => {
  const area = boundsOf([from, to], margin);
  const toGrid = (p: Vec2): Vec2 => ({ x: Math.round(p.x / step), y: Math.round(p.y / step) });
  const toWorld = (g: Vec2): Vec2 => ({ x: g.x * step, y: g.y * step });
  const [start, goal] = [toGrid(from), toGrid(to)];
  const [minCol, minRow] = [Math.floor(area.minX / step), Math.floor(area.minY / step)];
  const width = Math.ceil(area.maxX / step) - minCol + 1;
  const inArea = (g: Vec2) =>
    g.x * step >= area.minX && g.x * step <= area.maxX && g.y * step >= area.minY && g.y * step <= area.maxY;
  const path = findPath<Vec2>({
    start,
    isGoal: (g) => g.x === goal.x && g.y === goal.y,
    neighbors: (g) => moves.map((m) => ({ x: g.x + m.x, y: g.y + m.y })).filter(inArea),
    cost: (a, b) => cost(toWorld(a), toWorld(b)),
    heuristic: (g) => distance(toWorld(g), to) * heuristicCostPerUnit,
    keyOf: (g) => (g.y - minRow) * width + (g.x - minCol),
    maxExpansions,
  });
  if (!path) return undefined;
  return [from, ...path.slice(1, -1).map(toWorld), to];
};
