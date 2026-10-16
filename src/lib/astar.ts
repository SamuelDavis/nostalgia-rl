import { MinHeap } from "./heap";

export interface PathQuery<N> {
  readonly start: N;
  readonly isGoal: (node: N) => boolean;
  readonly neighbors: (node: N) => Iterable<N>;
  readonly cost: (from: N, to: N) => number;
  readonly heuristic: (node: N) => number;
  readonly keyOf: (node: N) => number | string;
  readonly maxExpansions?: number;
}

export const findPath = <N extends object>({
  start,
  isGoal,
  neighbors,
  cost,
  heuristic,
  keyOf,
  maxExpansions = Infinity,
}: PathQuery<N>): N[] | undefined => {
  const open = new MinHeap<N>();
  const costs = new Map<number | string, number>([[keyOf(start), 0]]);
  const cameFrom = new Map<number | string, N>();
  open.push(start, heuristic(start));

  for (let expansions = 0; open.size > 0 && expansions < maxExpansions; expansions++) {
    const current = open.pop()!;
    if (isGoal(current)) {
      const path = [current];
      for (let n = cameFrom.get(keyOf(current)); n !== undefined; n = cameFrom.get(keyOf(n))) path.push(n);
      return path.reverse();
    }
    const currentCost = costs.get(keyOf(current))!;
    for (const next of neighbors(current)) {
      const nextCost = currentCost + cost(current, next);
      const key = keyOf(next);
      if (nextCost < (costs.get(key) ?? Infinity)) {
        costs.set(key, nextCost);
        cameFrom.set(key, current);
        open.push(next, nextCost + heuristic(next));
      }
    }
  }
  return undefined;
};
