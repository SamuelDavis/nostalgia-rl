import type { Rng } from "procgen";
import { MAX_CLIMB, metresToLevels } from "../../constants";
import { Prop } from "../../terrain";

export const BuildingKind = {
  Cottage: "cottage",
  House: "house",
  Barn: "barn",
  Smithy: "smithy",
  Shop: "shop",
  Inn: "inn",
  Chapel: "chapel",
  Church: "church",
  Hall: "hall",
} as const;
export type BuildingKind = (typeof BuildingKind)[keyof typeof BuildingKind];

type Range = readonly [min: number, max: number];

export const BUILDING_SIZES: Record<BuildingKind, { readonly width: Range; readonly depth: Range }> = {
  [BuildingKind.Cottage]: { width: [5, 7], depth: [6, 8] },
  [BuildingKind.House]: { width: [7, 9], depth: [9, 11] },
  [BuildingKind.Barn]: { width: [8, 10], depth: [12, 15] },
  [BuildingKind.Smithy]: { width: [7, 8], depth: [7, 9] },
  [BuildingKind.Shop]: { width: [6, 8], depth: [8, 10] },
  [BuildingKind.Inn]: { width: [11, 13], depth: [13, 16] },
  [BuildingKind.Chapel]: { width: [7, 8], depth: [12, 14] },
  [BuildingKind.Church]: { width: [10, 12], depth: [20, 24] },
  [BuildingKind.Hall]: { width: [11, 13], depth: [16, 18] },
};

export const STOREYS: Record<BuildingKind, Range> = {
  [BuildingKind.Cottage]: [1, 1],
  [BuildingKind.House]: [1, 2],
  [BuildingKind.Barn]: [1, 1],
  [BuildingKind.Smithy]: [1, 1],
  [BuildingKind.Shop]: [2, 2],
  [BuildingKind.Inn]: [2, 3],
  [BuildingKind.Chapel]: [1, 1],
  [BuildingKind.Church]: [1, 1],
  [BuildingKind.Hall]: [1, 2],
};

export const STOREY = metresToLevels(3);
const FLIGHT = STOREY / MAX_CLIMB - 1;

interface Spot {
  readonly u: number;
  readonly v: number;
}

export interface Stairs {
  readonly from: number;
  readonly at: Spot;
  readonly step: Spot;
}

export interface Plan {
  readonly kind: BuildingKind;
  readonly width: number;
  readonly depth: number;
  readonly floors: readonly (readonly Prop[])[];
  readonly doors: readonly number[];
  readonly stairs: readonly Stairs[];
}

export const cellOf = ({ width, floors }: Plan, u: number, v: number, floor = 0): Prop =>
  floors[floor]![v * width + u]!;

const along = ({ at, step }: Stairs, n: number): Spot => ({ u: at.u + step.u * n, v: at.v + step.v * n });

export const stairTiles = (stairs: Stairs) => ({
  approach: along(stairs, -1),
  flight: Array.from({ length: FLIGHT }, (_, i) => along(stairs, i)),
  landing: along(stairs, FLIGHT),
});

export const riseOf = (plan: Plan, floor: number, u: number, v: number): number => {
  for (const stairs of plan.stairs) {
    const step = stairTiles(stairs).flight.findIndex((spot) => spot.u === u && spot.v === v);
    if (step < 0) continue;
    if (stairs.from === floor) return (step + 1) * MAX_CLIMB;
    if (stairs.from === floor - 1) return (step + 1) * MAX_CLIMB - STOREY;
  }
  return 0;
};

const OFFSETS: readonly Spot[] = [
  { u: 1, v: 0 },
  { u: -1, v: 0 },
  { u: 0, v: 1 },
  { u: 0, v: -1 },
];

const draftOf = (width: number, depth: number, doors: readonly number[], entries: readonly Spot[]) => {
  const cells: Prop[] = Array.from({ length: width * depth }, (_, i) => {
    const [u, v] = [i % width, Math.floor(i / width)];
    if (v === 0 && doors.includes(u)) return Prop.Door;
    return u === 0 || v === 0 || u === width - 1 || v === depth - 1 ? Prop.Wall : Prop.None;
  });
  const index = ({ u, v }: Spot) => v * width + u;
  const clear = new Set(entries.map((spot) => index({ u: spot.u, v: Math.max(spot.v, 1) })));
  const isInside = ({ u, v }: Spot) => u > 0 && v > 0 && u < width - 1 && v < depth - 1;
  const isFree = (spot: Spot) => isInside(spot) && cells[index(spot)] === Prop.None && !clear.has(index(spot));

  const isConnected = () => {
    const seen = new Set<number>();
    const queue = [...entries];
    while (queue.length > 0) {
      const spot = queue.pop()!;
      const i = index(spot);
      if (seen.has(i) || spot.u < 0 || spot.v < 0 || spot.u >= width || spot.v >= depth) continue;
      if (cells[i] !== Prop.None && cells[i] !== Prop.Door) continue;
      seen.add(i);
      for (const o of OFFSETS) queue.push({ u: spot.u + o.u, v: spot.v + o.v });
    }
    return cells.every((cell, i) => cell !== Prop.None || seen.has(i));
  };

  const keepIfConnected = (changes: readonly (readonly [Spot, Prop])[]) => {
    const before = changes.map(([spot]) => cells[index(spot)]!);
    for (const [spot, prop] of changes) cells[index(spot)] = prop;
    if (isConnected()) return true;
    changes.forEach(([spot], i) => (cells[index(spot)] = before[i]!));
    return false;
  };

  const wall = (spots: readonly Spot[], doorways: readonly Spot[]) => {
    const isDoorway = (spot: Spot) => doorways.some(({ u, v }) => u === spot.u && v === spot.v);
    const built = spots.filter((spot) => isFree(spot) && !isDoorway(spot));
    if (!keepIfConnected(built.map((spot) => [spot, Prop.Wall]))) return;
    for (const doorway of doorways)
      for (const o of OFFSETS) clear.add(index({ u: doorway.u + o.u, v: doorway.v + o.v }));
  };

  const furnish = (prop: Prop, spots: readonly Spot[], limit = Infinity) => {
    let placed = 0;
    for (const spot of spots) {
      if (placed >= limit) return;
      if (isFree(spot) && keepIfConnected([[spot, prop]])) placed++;
    }
  };

  const hugsWall = (spot: Spot, step: Spot) =>
    [1, -1].some((side) => cells[index({ u: spot.u + step.v * side, v: spot.v + step.u * side })] === Prop.Wall);

  const climb = (from: number, rng: Rng): Stairs | undefined => {
    const candidates = cells.flatMap((_, i) =>
      OFFSETS.map((step) => ({ from, at: { u: i % width, v: Math.floor(i / width) }, step })),
    );
    const fitting = rng
      .shuffle(candidates, from)
      .filter((stairs) => {
        const { approach, flight, landing } = stairTiles(stairs);
        return [approach, ...flight, landing].every(isFree);
      })
      .sort(
        (a, b) =>
          Number(stairTiles(b).flight.every((s) => hugsWall(s, b.step))) -
          Number(stairTiles(a).flight.every((s) => hugsWall(s, a.step))),
      );
    for (const stairs of fitting) {
      const { approach, flight, landing } = stairTiles(stairs);
      const steps = flight.map((spot, i): [Spot, Prop] => [spot, i === flight.length - 1 ? Prop.RampUp : Prop.Ramp]);
      if (!keepIfConnected(steps)) continue;
      clear.add(index(approach));
      clear.add(index(landing));
      return stairs;
    }
    return undefined;
  };

  const descend = (stairs: Stairs) => {
    const { flight, landing } = stairTiles(stairs);
    flight.forEach((spot, i) => (cells[index(spot)] = i === flight.length - 1 ? Prop.RampDown : Prop.Ramp));
    for (const spot of flight)
      for (const o of OFFSETS) {
        const beside = { u: spot.u + o.u, v: spot.v + o.v };
        if (isInside(beside) && cells[index(beside)] === Prop.None && index(beside) !== index(landing))
          cells[index(beside)] = Prop.Railing;
      }
  };

  return { cells, wall, furnish, climb, descend };
};

type Draft = ReturnType<typeof draftOf>;

const across = (v: number, from: number, to: number): Spot[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ u: from + i, v }));

const down = (u: number, from: number, to: number): Spot[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ u, v: from + i }));

const isSymmetric = (kind: BuildingKind) =>
  kind === BuildingKind.Inn ||
  kind === BuildingKind.Chapel ||
  kind === BuildingKind.Church ||
  kind === BuildingKind.Hall;

const doorsOf = (kind: BuildingKind, width: number, rng: Rng): number[] => {
  const mid = Math.floor(width / 2);
  if (kind === BuildingKind.Barn) return [mid - 1, mid];
  return [isSymmetric(kind) ? mid : rng.int(2, width - 3, 2)];
};

const widthOf = (kind: BuildingKind, [min, max]: Range, rng: Rng): number => {
  if (!isSymmetric(kind)) return rng.int(min, max, 0);
  const odd = min % 2 === 1 ? min : min + 1;
  return odd + 2 * rng.int(0, Math.floor((max - odd) / 2), 0);
};

interface Shape {
  readonly width: number;
  readonly depth: number;
  readonly mid: number;
  readonly back: number;
  readonly last: number;
  readonly side: number;
  readonly otherSide: number;
}

const edgesOf = ({ width, depth }: Shape): Spot[] => [
  ...across(1, 1, width - 2),
  ...across(depth - 2, 1, width - 2),
  ...down(1, 2, depth - 3),
  ...down(width - 2, 2, depth - 3),
];

const layOutGround = (kind: BuildingKind, draft: Draft, shape: Shape, rng: Rng, ascend: () => void) => {
  const { wall, furnish } = draft;
  const { depth, mid, back, last, side, otherSide } = shape;
  switch (kind) {
    case BuildingKind.Cottage:
      furnish(
        Prop.Hearth,
        [
          { u: mid, v: back },
          { u: side, v: Math.floor(depth / 2) },
        ],
        1,
      );
      furnish(
        Prop.Bed,
        [
          { u: otherSide, v: back },
          { u: side, v: back },
        ],
        1,
      );
      furnish(
        Prop.Table,
        [
          { u: mid, v: Math.floor(depth / 2) },
          { u: mid, v: back - 1 },
        ],
        1,
      );
      return;
    case BuildingKind.House: {
      const split = Math.floor(depth / 2);
      wall(across(split, 1, last), [{ u: rng.int(1, last, 4), v: split }]);
      ascend();
      furnish(
        Prop.Hearth,
        [
          { u: side, v: Math.ceil(split / 2) },
          { u: otherSide, v: Math.ceil(split / 2) },
        ],
        1,
      );
      furnish(Prop.Table, [{ u: mid, v: Math.ceil(split / 2) }], 1);
      furnish(
        Prop.Bed,
        [
          { u: 1, v: back },
          { u: last, v: back },
          { u: 1, v: split + 1 },
          { u: last, v: split + 1 },
        ],
        2,
      );
      furnish(Prop.Barrel, [{ u: mid, v: back }], 1);
      return;
    }
    case BuildingKind.Barn:
      furnish(
        Prop.Hay,
        [...down(1, 2, back), ...down(last, 2, back)].filter((_, i) => rng.chance(0.6, 5, i)),
      );
      return;
    case BuildingKind.Smithy:
      furnish(Prop.Forge, [{ u: mid, v: back }], 1);
      furnish(Prop.Anvil, [{ u: mid, v: back - 2 }], 1);
      furnish(Prop.Barrel, [
        { u: 1, v: back },
        { u: last, v: back },
      ]);
      return;
    case BuildingKind.Shop: {
      const split = Math.floor(depth / 2);
      const doorway = rng.int(1, last, 4);
      wall(across(split, 1, last), [{ u: doorway, v: split }]);
      ascend();
      furnish(
        Prop.Counter,
        across(split - 2, 1, last).filter(({ u }) => u !== doorway),
      );
      furnish(
        Prop.Barrel,
        across(back, 1, last).filter((_, i) => rng.chance(0.6, 5, i)),
      );
      return;
    }
    case BuildingKind.Inn: {
      const split = Math.floor(depth * 0.6);
      wall(
        [...across(split, 1, last), ...down(mid, split + 1, back)],
        [
          { u: rng.int(1, mid - 1, 4), v: split },
          { u: rng.int(mid + 1, last, 5), v: split },
        ],
      );
      ascend();
      furnish(Prop.Hearth, [{ u: side, v: Math.floor(split / 2) }], 1);
      furnish(Prop.Counter, across(split - 2, mid - 1, mid + 1));
      const tables = [2, 5, 8, 11]
        .filter((u) => u < last)
        .flatMap((u) => [2, 4].map((v) => ({ u: u + (side === 1 ? 1 : 0), v })));
      furnish(Prop.Table, tables);
      furnish(Prop.Hearth, [{ u: 1, v: back }], 1);
      furnish(Prop.Barrel, [...down(last, split + 1, back), ...across(back, mid + 1, last - 1)]);
      return;
    }
    case BuildingKind.Chapel:
    case BuildingKind.Church: {
      const aisle = kind === BuildingKind.Church ? 1 : 0;
      furnish(Prop.Altar, [{ u: mid, v: back }], 1);
      const rows = Array.from({ length: Math.floor((depth - 7) / 2) + 1 }, (_, i) => 3 + 2 * i).filter(
        (v) => v <= depth - 5,
      );
      furnish(
        Prop.Bench,
        rows.flatMap((v) => across(v, 1, last).filter(({ u }) => Math.abs(u - mid) > aisle)),
      );
      return;
    }
    case BuildingKind.Hall:
      ascend();
      furnish(Prop.Hearth, [{ u: mid, v: back }], 1);
      furnish(Prop.Table, down(mid, 4, depth - 5));
      furnish(Prop.Bench, [...down(mid - 1, 4, depth - 5), ...down(mid + 1, 4, depth - 5)]);
      return;
  }
};

const layOutUpper = (kind: BuildingKind, draft: Draft, shape: Shape, rng: Rng, floor: number, ascend: () => void) => {
  const { wall, furnish } = draft;
  const { depth, mid, back, last } = shape;
  const beds = rng.shuffle(edgesOf(shape), floor, 1);
  switch (kind) {
    case BuildingKind.House:
    case BuildingKind.Shop: {
      const split = Math.floor(depth / 2);
      wall(across(split, 1, last), [{ u: rng.int(1, last, floor, 2), v: split }]);
      ascend();
      furnish(Prop.Bed, beds, 3);
      furnish(Prop.Barrel, beds, 1);
      furnish(Prop.Table, [{ u: mid, v: Math.ceil(split / 2) }], 1);
      return;
    }
    case BuildingKind.Inn: {
      const split = Math.floor(depth / 2);
      wall(
        [...across(split, 1, last), ...down(mid, 1, split - 1), ...down(mid, split + 1, back)],
        [
          { u: rng.int(1, mid - 1, floor, 3), v: split },
          { u: rng.int(mid + 1, last, floor, 4), v: split },
          { u: mid, v: rng.int(1, split - 1, floor, 5) },
          { u: mid, v: rng.int(split + 1, back, floor, 6) },
        ],
      );
      ascend();
      furnish(Prop.Bed, beds, 8);
      furnish(Prop.Table, beds, 2);
      return;
    }
    default:
      ascend();
      furnish(Prop.Table, down(mid, 4, depth - 5));
      furnish(Prop.Bench, [...down(mid - 1, 4, depth - 5), ...down(mid + 1, 4, depth - 5)]);
  }
};

export const planBuilding = (kind: BuildingKind, rng: Rng): Plan => {
  const size = BUILDING_SIZES[kind];
  const width = widthOf(kind, size.width, rng);
  const depth = rng.int(...size.depth, 1);
  const storeys = rng.int(...STOREYS[kind], 6);
  const doors = doorsOf(kind, width, rng);
  const last = width - 2;
  const side = rng.chance(0.5, 3) ? 1 : last;
  const shape: Shape = {
    width,
    depth,
    mid: Math.floor(width / 2),
    back: depth - 2,
    last,
    side,
    otherSide: side === 1 ? last : 1,
  };
  const stairs: Stairs[] = [];
  const climbs = rng.child("stairs");
  const ascendFrom = (draft: Draft, floor: number) => () => {
    if (floor + 1 >= storeys) return;
    const flight = draft.climb(floor, climbs);
    if (flight) stairs.push(flight);
  };

  const ground = draftOf(
    width,
    depth,
    doors,
    doors.map((u) => ({ u, v: 0 })),
  );
  layOutGround(kind, ground, shape, rng, ascendFrom(ground, 0));
  const floors = [ground.cells];
  for (let floor = 1; floor < storeys; floor++) {
    const below = stairs.find((flight) => flight.from === floor - 1);
    if (!below) break;
    const upper = draftOf(width, depth, [], [stairTiles(below).landing]);
    upper.descend(below);
    layOutUpper(kind, upper, shape, rng, floor, ascendFrom(upper, floor));
    floors.push(upper.cells);
  }
  return { kind, width, depth, floors, doors, stairs: stairs.filter((flight) => flight.from < floors.length - 1) };
};
