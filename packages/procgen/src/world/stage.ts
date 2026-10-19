import { memoize } from "../core/cache";
import { type Bounds, type Vec2, expand, overlaps } from "../core/geometry";
import { type Rng, rngOf } from "../core/hash";
import { type Cell, type Grid, cellKey } from "./grid";

export interface Dependency {
  readonly stage: Stage<unknown>;
  readonly radius: number;
}

export interface Reader {
  read<T>(stage: Stage<T>, cell: Cell): T;
  readAt<T>(stage: Stage<T>, p: Vec2): T;
  gather<T>(stage: Stage<readonly T[]>, bounds: Bounds): T[];
}

export interface StageContext extends Reader {
  readonly seed: number;
  readonly rng: Rng;
}

export interface Stage<T> {
  readonly name: string;
  readonly grid: Grid;
  readonly reads: readonly Dependency[];
  readonly cache: number;
  readonly compute: (cell: Cell, context: StageContext) => T;
}

export interface StageDefinition<T> {
  readonly name: string;
  readonly grid: Grid;
  readonly reads?: readonly Dependency[];
  readonly cache?: number;
  readonly compute: (cell: Cell, context: StageContext) => T;
}

const DEFAULT_CACHE = 4096;

export const stage = <T>({ reads = [], cache = DEFAULT_CACHE, ...definition }: StageDefinition<T>): Stage<T> => ({
  ...definition,
  reads,
  cache,
});

export const reachOf = (of: Stage<unknown>): number =>
  Math.max(0, ...of.reads.map(({ stage: read, radius }) => radius + read.grid.size + reachOf(read)));

export interface World extends Reader {
  readonly seed: number;
}

const readerOf = (read: <T>(stage: Stage<T>, cell: Cell) => T): Reader => ({
  read,
  readAt: (target, p) => read(target, target.grid.cellOf(p)),
  gather: (target, bounds) => target.grid.cellsOverlapping(bounds).flatMap((cell) => read(target, cell)),
});

export const createWorld = (seed: number): World => {
  const computed = new Map<Stage<unknown>, (cell: Cell) => unknown>();
  const named = new Map<string, Stage<unknown>>();

  const contextOf = (reader: Stage<unknown>, at: Cell): StageContext => {
    const window = (radius: number) => expand(reader.grid.boundsOf(at), radius);
    return {
      seed,
      rng: rngOf(seed, reader.name),
      ...readerOf((target, cell) => {
        const dependency = reader.reads.find(({ stage: read }) => read === target);
        if (!dependency) throw new Error(`Stage "${reader.name}" reads "${target.name}" without declaring it`);
        if (!overlaps(target.grid.boundsOf(cell), window(dependency.radius)))
          throw new Error(
            `Stage "${reader.name}" at ${cellKey(at)} reads "${target.name}" at ${cellKey(cell)}, beyond its radius ${dependency.radius}`,
          );
        return read(target, cell);
      }),
    };
  };

  const computeOf = <T>(target: Stage<T>): ((cell: Cell) => T) => {
    const existing = computed.get(target);
    if (existing) return existing as (cell: Cell) => T;
    const clash = named.get(target.name);
    if (clash && clash !== target) throw new Error(`Two stages are named "${target.name}"`);
    named.set(target.name, target);
    const compute = memoize((cell: Cell) => target.compute(cell, contextOf(target, cell)), cellKey, target.cache);
    computed.set(target, compute);
    return compute;
  };

  const read = <T>(target: Stage<T>, cell: Cell): T => computeOf(target)(cell);

  return { seed, ...readerOf(read) };
};
