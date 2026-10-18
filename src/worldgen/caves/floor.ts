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
import { CEILING, type LevelledTile, RAMP_GAP, type Ramp, type createCavePlans, isOnFloors, rampFrom } from "./plan";
import type { Junction } from "./junctions";
import { type Chamber, type Entry, type Tunnel, type Workings, pickedInOrder, sidesOf, workFloor } from "./mine";
import { type Cave, TERRITORY_RADIUS } from "./siting";

export type FloorMark = "slope" | "down" | "up" | "exit";

export interface FloorLayout {
  readonly isOpen: (p: Point) => boolean;
  readonly isChamber: (p: Point) => boolean;
  readonly isWorked: (p: Point) => boolean;
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

interface FloorPlan {
  readonly base: number;
  readonly kinds: Uint8Array;
  readonly levels: Int16Array;
  readonly chambers: readonly Chamber[];
  readonly tunnels: readonly Tunnel[];
  readonly ends: readonly Point[];
  readonly flights: readonly Flight[];
  readonly passage: readonly Point[];
  readonly features: readonly Point[];
  readonly isAllowed: (p: Point) => boolean;
  readonly isBlocked: (i: number) => boolean;
  readonly isOwned: (p: Point) => boolean;
}

interface Flight {
  readonly ramp: Ramp;
  readonly isUpper: boolean;
}

interface Mine {
  readonly entry: Entry;
  readonly workings: Workings;
  readonly down?: Ramp;
  readonly up?: Ramp;
}

const SALT = hashString("cave floors");
const SIDE = 2 * TERRITORY_RADIUS + 1;
const ROCK = 0;
const TUNNEL = 1;
const CHAMBER = 2;
const WORKED = 3;
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
const STAIR_LENGTH = 9;
const FLOOR_CACHE = 128;

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const tileCentre = (p: Point): Point => ({ x: p.x + 0.5, y: p.y + 0.5 });
const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const halfOf = ({ ramp, isUpper }: Flight) => (isUpper ? ramp.tiles.slice(0, ramp.link) : ramp.tiles.slice(ramp.link));
const endOf = ({ ramp, isUpper }: Flight) => (isUpper ? ramp.tiles[0]! : ramp.tiles.at(-1)!);
const marksOf = ({ ramp, isUpper }: Flight): [Point, FloorMark][] =>
  isUpper
    ? ramp.tiles.slice(0, ramp.link).map((t, i) => [t, i === ramp.link - 1 ? "down" : "slope"])
    : ramp.tiles.slice(ramp.link).map((t, i) => [t, i === 0 ? "up" : "slope"]);

export const createCaveFloors = ({ seed, fields, caveOwning, plans, junctionsOf }: CaveFloorInput) => {
  const roughness = createNoise(seed, SALT);
  const wobble = createNoise(seed, hash(SALT, 1));
  const groundAt = (p: Point) => heightLevel(fields.elevation(p.x + 0.5, p.y + 0.5));

  const gridOf = memoize(
    (cave: Cave) => {
      const [minX, minY] = [cave.x - TERRITORY_RADIUS, cave.y - TERRITORY_RADIUS];
      const indexOf = ({ x, y }: Point) =>
        x < minX || y < minY || x >= minX + SIDE || y >= minY + SIDE ? -1 : (y - minY) * SIDE + (x - minX);
      const ownership = new Int8Array(SIDE * SIDE).fill(UNKNOWN);
      return {
        indexOf,
        pointOf: (i: number): Point => ({ x: minX + (i % SIDE), y: minY + Math.floor(i / SIDE) }),
        isTerritory: (p: Point) => {
          const i = indexOf(p);
          if (i < 0) return false;
          if (ownership[i] === UNKNOWN) ownership[i] = caveOwning(p)?.id === cave.id ? 1 : 0;
          return ownership[i] === 1;
        },
      };
    },
    (cave) => String(cave.id),
    FLOOR_CACHE,
  );

  const planFloor = (cave: Cave, floor: number): FloorPlan => {
    const plan = plans.planOf(cave);
    const isNatural = isOnFloors(plan, floor);
    const base = plan.baseOf(floor);
    const { indexOf, isTerritory } = gridOf(cave);

    const kinds = new Uint8Array(SIDE * SIDE);
    const levels = new Int16Array(SIDE * SIDE).fill(base);
    const allowance = new Int8Array(SIDE * SIDE).fill(UNKNOWN);

    const below = isNatural && floor > plan.bottom ? plans.rampBelow(cave, floor) : undefined;
    const above = isNatural && floor < plan.top ? plans.rampBelow(cave, floor + 1) : undefined;
    const junctions = junctionsOf(cave).filter((j) => j.floor === floor);
    const junctionsBesides = junctionsOf(cave).filter((j) => Math.abs(j.floor - floor) === 1);
    const flights = [
      ...(below ? [{ ramp: below, isUpper: true }] : []),
      ...(above ? [{ ramp: above, isUpper: false }] : []),
    ];
    const ownSlopes: LevelledTile[] = [...flights.flatMap(halfOf), ...junctions.flatMap((j) => j.tiles)];
    const foreignSlopes = [
      ...flights.flatMap((f) => halfOf({ ...f, isUpper: !f.isUpper })),
      ...junctionsBesides.flatMap((j) => j.tiles),
    ];
    const passage = floor === 0 ? plan.mouth.passage : [];
    const ends = [...(passage[0] ? [passage[0]] : []), ...flights.map(endOf), ...junctions.map((j) => j.tiles.at(-1)!)];
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
      if (allowance[i] === UNKNOWN) allowance[i] = isTerritory(p) && groundAt(p) >= base + CEILING ? 1 : 0;
      return allowance[i] === 1;
    };
    const carve = (p: Point, kind: number) => {
      const i = indexOf(p);
      if (i >= 0 && isNatural) kinds[i] = Math.max(kinds[i]!, kind);
    };

    const grid = Array.from({ length: GRID_COLUMNS * GRID_COLUMNS }, (_, i) => ({
      x: cave.x - TERRITORY_RADIUS + (i % GRID_COLUMNS) * CHAMBER_GRID,
      y: cave.y - TERRITORY_RADIUS + Math.floor(i / GRID_COLUMNS) * CHAMBER_GRID,
    })).filter(isAllowed);
    const count = clamp(Math.round((grid.length * CHAMBER_GRID * CHAMBER_GRID) / TILES_PER_CHAMBER), ...CHAMBER_COUNTS);
    const chambers: Chamber[] = [];
    const shuffled = grid
      .map((p) => ({ p, order: hash(seed, SALT, cave.id, floor, p.x, p.y) }))
      .sort((a, b) => a.order - b.order);
    for (const { p } of shuffled) {
      if (chambers.length >= count) break;
      if ([...chambers, ...ends].every((c) => distance(c, p) >= CHAMBER_GAP))
        chambers.push({ ...p, radius: intBetween(...CHAMBER_RADII, hash(seed, SALT, cave.id, floor, p.x, p.y, 1)) });
    }

    for (const centre of chambers) {
      const { radius } = centre;
      for (let y = centre.y - radius - 3; y <= centre.y + radius + 3; y++)
        for (let x = centre.x - radius - 3; x <= centre.x + radius + 3; x++) {
          const p = { x, y };
          const shape =
            distance(tileCentre(p), tileCentre(centre)) / radius +
            CHAMBER_ROUGHNESS * roughness(x / ROUGHNESS_SCALE, y / ROUGHNESS_SCALE);
          if (shape < 1 && isAllowed(p)) carve(p, CHAMBER);
        }
    }

    const nodes: Point[] = [...ends, ...chambers];
    const edges = nodes.flatMap((a, i) =>
      relativeNeighbours(a, nodes)
        .filter((b) => nodes.indexOf(b) > i)
        .map((b) => [a, b] as const),
    );
    const isOwned = (p: Point) => !isBlocked(indexOf(p)) && isTerritory(p);
    const isUnderground = (p: Point) => isOwned(p) && groundAt(p) >= base;
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
    const tunnels = edges.flatMap(([a, b]) => {
      const path = tunnelBetween(a, b);
      return path ? [{ a, b, path: [a, ...path.slice(1, -1), b] }] : [];
    });
    for (const { path } of tunnels) {
      const points = path.map(tileCentre);
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

    return {
      base,
      kinds,
      levels,
      chambers,
      tunnels,
      ends,
      flights,
      passage,
      features: [...ownSlopes, ...foreignSlopes, ...passage],
      isAllowed,
      isBlocked,
      isOwned,
    };
  };

  const planOf = memoize(
    ({ cave, floor }: { cave: Cave; floor: number }) => planFloor(cave, floor),
    ({ cave, floor }) => `${cave.id}:${floor}`,
    FLOOR_CACHE,
  );

  let mineOf: (key: { cave: Cave; floor: number }) => Mine | undefined;

  const stairBelow = (cave: Cave, floor: number): Ramp | undefined =>
    floor <= 0 ? mineOf({ cave, floor })?.down : mineOf({ cave, floor: floor - 1 })?.up;

  const stairsOn = (cave: Cave, floor: number): Flight[] => {
    const [below, above] = [stairBelow(cave, floor), stairBelow(cave, floor + 1)];
    return [...(below ? [{ ramp: below, isUpper: true }] : []), ...(above ? [{ ramp: above, isUpper: false }] : [])];
  };

  const arrivalOn = (cave: Cave, floor: number): Flight | undefined => {
    if (floor === 0) return undefined;
    const ramp = stairBelow(cave, floor < 0 ? floor + 1 : floor);
    return ramp && { ramp, isUpper: floor > 0 };
  };

  const entryOf = (cave: Cave, floor: number): Entry | undefined => {
    if (floor === 0) {
      const { passage } = plans.planOf(cave).mouth;
      return { at: passage[0]!, heading: minus(passage[0]!, passage[1]!) };
    }
    const arrival = arrivalOn(cave, floor);
    if (!arrival) return undefined;
    const { tiles } = arrival.ramp;
    const [end, before] = arrival.isUpper ? [tiles[0]!, tiles[1]!] : [tiles.at(-1)!, tiles.at(-2)!];
    const heading = minus(end, before);
    return { at: plus(end, heading), heading };
  };

  const stairOutOf = (
    cave: Cave,
    floor: number,
    to: number,
    workings: Workings,
    reserved: readonly Point[],
  ): Ramp | undefined => {
    const { baseOf } = plans.planOf(cave);
    const { indexOf, isTerritory } = gridOf(cave);
    const [here, there] = [planOf({ cave, floor }), planOf({ cave, floor: to })];
    const worked = new Set(workings.tiles.map(indexOf));
    const taken = new Set(reserved.map(indexOf));
    const features = [...here.features, ...there.features];
    const h = hash(seed, SALT, cave.id, floor, to);
    for (const room of pickedInOrder(workings.rooms, h))
      for (const { edge, outward } of pickedInOrder(sidesOf(room), hash(h, room.centre.x, room.centre.y))) {
        const far = plus(edge, { x: outward.x * STAIR_LENGTH, y: outward.y * STAIR_LENGTH });
        const ramp =
          to < floor
            ? rampFrom(plus(edge, outward), outward, baseOf(floor), baseOf(to), STAIR_LENGTH)
            : rampFrom(far, { x: -outward.x, y: -outward.y }, baseOf(to), baseOf(floor), STAIR_LENGTH);
        const arrival = plus(far, outward);
        const fits =
          worked.has(indexOf(edge)) &&
          there.isOwned(arrival) &&
          ramp.tiles.every((t) => {
            const i = indexOf(t);
            return (
              i >= 0 &&
              isTerritory(t) &&
              groundAt(t) >= t.level + CEILING &&
              [here, there].every((plan) => plan.kinds[i] === ROCK && !plan.isBlocked(i)) &&
              !worked.has(i) &&
              !taken.has(i) &&
              features.every((f) => distance(f, t) > RAMP_GAP)
            );
          });
        if (fits) return ramp;
      }
    return undefined;
  };

  mineOf = memoize(
    ({ cave, floor }: { cave: Cave; floor: number }): Mine | undefined => {
      const { mine } = plans.planOf(cave);
      const entry = mine && isOnFloors(mine, floor) ? entryOf(cave, floor) : undefined;
      if (!mine || !entry) return undefined;
      const plan = planOf({ cave, floor });
      const { indexOf } = gridOf(cave);
      const arrival = arrivalOn(cave, floor);
      const arrivingTiles = arrival?.ramp.tiles ?? [];
      const arriving = new Set(arrivingTiles.map(indexOf));
      const workings = workFloor(
        {
          chambers: plan.chambers,
          tunnels: plan.tunnels,
          canDig: (p) => plan.isAllowed(p) && !arriving.has(indexOf(p)),
          canCut: (p) => !plan.isBlocked(indexOf(p)) && !arriving.has(indexOf(p)),
        },
        entry,
        hash(seed, SALT, cave.id, floor),
      );
      const down =
        floor <= 0 && floor > mine.bottom ? stairOutOf(cave, floor, floor - 1, workings, arrivingTiles) : undefined;
      const up =
        floor >= 0 && floor < mine.top
          ? stairOutOf(cave, floor, floor + 1, workings, [...arrivingTiles, ...(down?.tiles ?? [])])
          : undefined;
      return { entry, workings, down, up };
    },
    ({ cave, floor }) => `${cave.id}:${floor}`,
    FLOOR_CACHE,
  );

  const build = (cave: Cave, floor: number): FloorLayout => {
    const plan = planOf({ cave, floor });
    const { indexOf, pointOf } = gridOf(cave);
    const kinds = plan.kinds.slice();
    const levels = plan.levels.slice();
    const mine = mineOf({ cave, floor });
    const stairs = stairsOn(cave, floor);
    for (const p of mine ? [...plan.passage, ...mine.workings.tiles] : []) {
      const i = indexOf(p);
      if (i >= 0) kinds[i] = WORKED;
    }
    for (const t of stairs.flatMap(halfOf)) {
      const i = indexOf(t);
      kinds[i] = WORKED;
      levels[i] = t.level;
    }
    const stairTiles = new Set(stairs.flatMap(({ ramp }) => ramp.tiles).map(indexOf));

    const ends = [...plan.ends, ...(mine ? [mine.entry.at] : []), ...stairs.map(endOf)];
    const isOwned = (p: Point) => plan.isOwned(p) && !stairTiles.has(indexOf(p));
    const step = (from: number, to: number) => Math.abs(levels[from]! - levels[to]!) <= MAX_CLIMB;
    const spread = (starts: readonly number[], canEnter: (from: number, to: number) => boolean) => {
      const cameFrom = new Map(starts.map((i) => [i, i]));
      const frontier = [...starts];
      for (let k = 0; k < frontier.length; k++) {
        const i = frontier[k]!;
        for (const o of NEIGHBOURS) {
          const n = indexOf(plus(pointOf(i), o));
          if (n < 0 || cameFrom.has(n) || !canEnter(i, n)) continue;
          cameFrom.set(n, i);
          frontier.push(n);
        }
      }
      return cameFrom;
    };
    const isWalkable = (from: number, to: number) => kinds[to] !== ROCK && step(from, to);
    const start = indexOf(ends[0] ?? cave);
    let reached = spread([start], isWalkable);
    for (const end of ends.map(indexOf).filter((i) => !reached.has(i))) {
      const toward = spread([end], (from, to) => (reached.has(to) && step(from, to)) || isOwned(pointOf(to)));
      const meeting = [...toward.keys()].find((i) => reached.has(i));
      for (let i = meeting; i !== undefined && i !== end; i = toward.get(i)) kinds[i] = Math.max(kinds[i]!, TUNNEL);
      reached = spread([start], isWalkable);
    }
    const marks = new Map<number, FloorMark>(
      [
        ...plan.passage.slice(-1).map((t) => [t, "exit"] as [Point, FloorMark]),
        ...[...plan.flights, ...stairs].flatMap(marksOf),
      ].map(([t, mark]) => [indexOf(t), mark]),
    );
    const kindAt = (p: Point) => {
      const i = indexOf(p);
      return i < 0 ? ROCK : kinds[i]!;
    };
    return {
      markAt: (p) => marks.get(indexOf(p)),
      isOpen: (p) => kindAt(p) !== ROCK,
      isChamber: (p) => kindAt(p) === CHAMBER,
      isWorked: (p) => kindAt(p) === WORKED,
      levelAt: (p) => {
        const i = indexOf(p);
        return i < 0 ? plan.base : levels[i]!;
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

  return {
    floorOf: (cave: Cave, floor: number) => floorOf({ cave, floor }),
    stairBelow,
  };
};
