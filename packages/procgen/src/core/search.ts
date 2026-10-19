export class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly priorities: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: T, priority: number): void {
    this.items.push(item);
    this.priorities.push(priority);
    this.siftUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPriority = this.priorities.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.priorities[0] = lastPriority;
      this.siftDown(0);
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.priorities[a], this.priorities[b]] = [this.priorities[b]!, this.priorities[a]!];
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.priorities[parent]! <= this.priorities[i]!) return;
      this.swap(i, parent);
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const n = this.items.length;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.priorities[left]! < this.priorities[smallest]!) smallest = left;
      if (right < n && this.priorities[right]! < this.priorities[smallest]!) smallest = right;
      if (smallest === i) return;
      this.swap(i, smallest);
      i = smallest;
    }
  }
}

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
