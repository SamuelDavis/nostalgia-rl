import {
  type Bounds,
  type Cell,
  type FeatureType,
  type Stage,
  type Vec2,
  clamp,
  contains as boundsContain,
  distance,
  expand,
  lerp,
  projectOntoSegment,
  rngOf,
  simplex2,
  stage,
} from "procgen";
import { REGION_SIZE } from "../constants";
import { type River, distanceToRiver } from "../rivers";
import type { Glade } from "../landmarks";
import { regions } from "../region";
import { climbCost, pathOf, route } from "../routing";
import { Biome, Cover, Ground, Prop, Water, Way } from "../terrain";
import { type WayLink, distinctWays } from "../ways";
import { CAMP_RADIUS, type Camp } from "./camp";
import type { Anchor, Opening, TileDraft } from "./feature";

export interface DeepForest extends Anchor {
  readonly region: Cell;
  readonly cells: ReadonlySet<number>;
  readonly footprintCells: ReadonlySet<number>;
  readonly camps: readonly Vec2[];
}

export interface Link {
  readonly here: Vec2;
  readonly there: Vec2;
}

export interface DeepForestLayout {
  readonly forest: DeepForest;
  readonly glade: Glade;
  readonly openings: readonly Opening[];
  readonly links: readonly Link[];
  readonly stops: readonly Vec2[];
  readonly contains: (p: Vec2) => boolean;
  readonly paths: ReadonlySet<string>;
  readonly mouths: ReadonlySet<string>;
  readonly nearby: readonly DeepForest[];
}

export interface DeepForestSiting {
  readonly seed: number;
  readonly level: (p: Vec2) => number;
  readonly forestness: (p: Vec2) => number;
  readonly camps: Stage<readonly Camp[]>;
  readonly rivers: Stage<readonly River[]>;
}

export const DEEP_FORESTNESS = 0.7;
const SEAM_FORESTNESS = 0.08;
const CELL = 8;
const CELLS_PER_SIDE = REGION_SIZE / CELL;
const MIN_CELLS = 10;
const MARGIN = 2 * CELL;
const DEEP_FOREST_REACH = REGION_SIZE + MARGIN;
export const OPENING_REACH = MARGIN + 2;
const GUARANTEED_OPENINGS = 2;
const OPENING_STEP = 2;
const GLADE_RADII = [5, 8] as const;
const NOTCH_NODES = 2;
const EDGE_DENSITY = 0.45;
const CORE_DENSITY = 0.85;
const UNDERGROWTH = 0.4;
const PATH_HALF_WIDTH = 0.8;
const PATH_WOBBLE = 1.5;
const PATH_WOBBLE_SCALE = 12;
const PATH_REUSE = 0.35;
const PATH_TYPICAL_COST = 2;
const PATH_WATER_PENALTY = 8;
const DEEP_TILE_CACHE = 1 << 18;
const TILE_KEY_STRIDE = 1 << 26;

const NEIGHBOURS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const AROUND: readonly Vec2[] = [...NEIGHBOURS, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];

const HEART_REACH: readonly Vec2[] = Array.from({ length: 25 }, (_, i) => ({
  x: (i % 5) - 2,
  y: Math.floor(i / 5) - 2,
}));

const DIRECTIONS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

const along = (from: Vec2, direction: Vec2, length: number): Vec2 => ({
  x: from.x + direction.x * length,
  y: from.y + direction.y * length,
});

const cellIndex = (col: number, row: number) => row * CELLS_PER_SIDE + col;

const isCellOnGrid = (col: number, row: number) => col >= 0 && col < CELLS_PER_SIDE && row >= 0 && row < CELLS_PER_SIDE;

const cellTile = ({ col, row }: Cell, index: number): Vec2 => ({
  x: col * REGION_SIZE + (index % CELLS_PER_SIDE) * CELL + CELL / 2,
  y: row * REGION_SIZE + Math.floor(index / CELLS_PER_SIDE) * CELL + CELL / 2,
});

const tileCentre = (p: Vec2): Vec2 => ({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 });

const isInCamp = (forest: DeepForest, p: Vec2) =>
  forest.camps.some((camp) => distance(tileCentre(p), { x: camp.x + 0.5, y: camp.y + 0.5 }) <= CAMP_RADIUS);

const colRow = (index: number) => [index % CELLS_PER_SIDE, Math.floor(index / CELLS_PER_SIDE)] as const;

export const gladeOf = (forest: DeepForest): Glade => ({
  x: forest.x,
  y: forest.y,
  radius: rngOf(forest.id).int(...GLADE_RADII, 1),
});

const boundsOfForest = (forest: DeepForest): Bounds => {
  const tiles = [...forest.cells].map((i) => cellTile(forest.region, i));
  return {
    minX: Math.min(...tiles.map((t) => t.x)) - MARGIN,
    minY: Math.min(...tiles.map((t) => t.y)) - MARGIN,
    maxX: Math.max(...tiles.map((t) => t.x)) + MARGIN,
    maxY: Math.max(...tiles.map((t) => t.y)) + MARGIN,
  };
};

const tileKey = (x: number, y: number) => `${x},${y}`;

const rasterize = (nodes: readonly Vec2[], tiles: Set<string>) =>
  nodes.forEach((a, i) => {
    const b = nodes[i + 1] ?? a;
    for (let y = Math.floor(Math.min(a.y, b.y)) - 1; y <= Math.floor(Math.max(a.y, b.y)) + 1; y++)
      for (let x = Math.floor(Math.min(a.x, b.x)) - 1; x <= Math.floor(Math.max(a.x, b.x)) + 1; x++)
        if (projectOntoSegment({ x: x + 0.5, y: y + 0.5 }, a, b).distance <= PATH_HALF_WIDTH) tiles.add(tileKey(x, y));
  });

interface Run {
  readonly before?: Vec2;
  readonly inside: readonly Vec2[];
  readonly after?: Vec2;
}

const densely = (nodes: readonly Vec2[]): Vec2[] =>
  nodes.flatMap((a, i) => {
    const b = nodes[i + 1];
    if (!b) return [a];
    const steps = Math.max(1, Math.ceil(distance(a, b)));
    return Array.from({ length: steps }, (_, k) => ({
      x: a.x + ((b.x - a.x) * k) / steps,
      y: a.y + ((b.y - a.y) * k) / steps,
    }));
  });

const runsWithin = (nodes: readonly Vec2[], contains: (p: Vec2) => boolean): Run[] => {
  const runs: Run[] = [];
  let run: { before?: Vec2; inside: Vec2[] } | undefined;
  let previous: Vec2 | undefined;
  for (const p of densely(nodes)) {
    if (contains(p)) {
      run ??= { before: previous, inside: [] };
      run.inside.push(p);
    } else if (run) {
      runs.push({ ...run, after: p });
      run = undefined;
    }
    previous = p;
  }
  if (run) runs.push(run);
  return runs;
};

export const createDeepForests = ({ seed, level, forestness, camps, rivers }: DeepForestSiting) => {
  const rng = rngOf(seed, "deep forests");
  const wobble = simplex2(rng.child("wobble").key);

  const deepTiles = new Map<number, boolean>();
  const isDeep = (p: Vec2) => {
    const key = Math.floor(p.x) * TILE_KEY_STRIDE + Math.floor(p.y);
    let deep = deepTiles.get(key);
    if (deep === undefined) {
      if (deepTiles.size >= DEEP_TILE_CACHE) deepTiles.clear();
      deep = forestness(tileCentre(p)) >= DEEP_FORESTNESS;
      deepTiles.set(key, deep);
    }
    return deep;
  };

  const parts = stage({
    name: "deep forest parts",
    grid: regions,
    reads: [{ stage: camps, radius: CAMP_RADIUS }],
    compute: (region, context): readonly DeepForest[] => {
      const deep = Array.from({ length: CELLS_PER_SIDE * CELLS_PER_SIDE }, (_, i) => isDeep(cellTile(region, i)));
      const isDeepCell = (col: number, row: number) => isCellOnGrid(col, row) && deep[cellIndex(col, row)]!;
      const componentOf = (start: number) => {
        const cells = new Set([start]);
        const frontier = [start];
        while (frontier.length > 0) {
          const [col, row] = colRow(frontier.pop()!);
          for (const o of NEIGHBOURS) {
            const next = cellIndex(col + o.x, row + o.y);
            if (!isDeepCell(col + o.x, row + o.y) || cells.has(next)) continue;
            cells.add(next);
            frontier.push(next);
          }
        }
        return cells;
      };
      const heartOf = (cells: ReadonlySet<number>) =>
        [...cells]
          .map((index) => {
            const [col, row] = colRow(index);
            return { index, depth: HEART_REACH.filter((o) => isDeepCell(col + o.x, row + o.y)).length };
          })
          .reduce((best, cell) => (cell.depth > best.depth ? cell : best)).index;

      const seen = new Set<number>();
      const components = deep.flatMap((isCellDeep, index) => {
        if (!isCellDeep || seen.has(index)) return [];
        const cells = componentOf(index);
        cells.forEach((cell) => seen.add(cell));
        return cells.size >= MIN_CELLS ? [cells] : [];
      });
      components.sort((a, b) => b.size - a.size);
      const owned = new Set(components.flatMap((cells) => [...cells]));
      const campsNear = context.gather(camps, expand(regions.boundsOf(region), CAMP_RADIUS));
      return components.map((cells) => {
        const ring = [...cells].flatMap((index) => {
          const [col, row] = colRow(index);
          return AROUND.filter((o) => isCellOnGrid(col + o.x, row + o.y))
            .map((o) => cellIndex(col + o.x, row + o.y))
            .filter((cell) => !owned.has(cell));
        });
        ring.forEach((cell) => owned.add(cell));
        const heart = heartOf(cells);
        return {
          ...cellTile(region, heart),
          id: context.rng.u32(heart),
          region,
          cells,
          footprintCells: new Set([...cells, ...ring]),
          camps: campsNear,
        };
      });
    },
  });

  const isInFootprint = (forest: DeepForest, p: Vec2) => {
    const col = Math.floor((p.x - forest.region.col * REGION_SIZE) / CELL);
    const row = Math.floor((p.y - forest.region.row * REGION_SIZE) / CELL);
    return isCellOnGrid(col, row) && forest.footprintCells.has(cellIndex(col, row)) && !isInCamp(forest, p);
  };

  const isUnder = (forest: DeepForest, p: Vec2) => isInFootprint(forest, p) && isDeep(p);

  const isCovered = (partsAt: (p: Vec2) => readonly DeepForest[], p: Vec2, near: DeepForest) =>
    isInFootprint(near, p) ? isDeep(p) : partsAt(p).some((forest) => isUnder(forest, p));

  const linksOf = (forest: DeepForest, partsIn: (region: Cell) => readonly DeepForest[]): Link[] =>
    NEIGHBOURS.flatMap((o) =>
      partsIn({ col: forest.region.col + o.x, row: forest.region.row + o.y }).flatMap((other) => {
        const step = o.x + o.y;
        const edge = (part: DeepForest, k: number, side: number) => {
          const last = CELLS_PER_SIDE - 1;
          const [col, row] = o.x !== 0 ? [side > 0 ? last : 0, k] : [k, side > 0 ? last : 0];
          return part.cells.has(cellIndex(col, row)) ? cellTile(part.region, cellIndex(col, row)) : undefined;
        };
        const pairs = Array.from({ length: CELLS_PER_SIDE }, (_, k) => ({
          here: edge(forest, k, step),
          there: edge(other, k, -step),
        })).filter((pair): pair is Link => pair.here !== undefined && pair.there !== undefined);
        if (pairs.length === 0) return [];
        const pick = rng.int(0, pairs.length - 1, Math.min(forest.id, other.id), Math.max(forest.id, other.id));
        return [pairs[pick]!];
      }),
    );

  const guaranteedOpeningsOf = (forest: DeepForest, partsAt: (p: Vec2) => readonly DeepForest[]): Opening[] => {
    const contains = (p: Vec2) => isUnder(forest, tileCentre(p));
    const glade = gladeOf(forest);
    return Array.from({ length: DIRECTIONS.length }, (_, i) => {
      const direction = DIRECTIONS[(rngOf(forest.id).u32(2) + i * 3) % DIRECTIONS.length]!;
      let length = glade.radius;
      while (contains(along(forest, direction, length + OPENING_STEP))) length += OPENING_STEP;
      const outside = along(forest, direction, length + OPENING_STEP);
      return isCovered(partsAt, tileCentre(outside), forest)
        ? undefined
        : { inside: along(forest, direction, length), outside };
    })
      .filter((opening) => opening !== undefined)
      .slice(0, GUARANTEED_OPENINGS);
  };

  const guaranteed = stage({
    name: "deep forest openings",
    grid: regions,
    reads: [{ stage: parts, radius: OPENING_REACH }],
    compute: (region, { read }): readonly (readonly Opening[])[] => {
      const partsAt = (p: Vec2) => read(parts, regions.cellOf(p));
      return read(parts, region).map((forest) => guaranteedOpeningsOf(forest, partsAt));
    },
  });

  const openings = stage({
    name: "deep forest opening list",
    grid: regions,
    reads: [{ stage: guaranteed, radius: 0 }],
    compute: (region, { read }): readonly Opening[] => read(guaranteed, region).flat(),
  });

  const build = (
    forest: DeepForest,
    ways: readonly WayLink[],
    riversNear: readonly River[],
    nearby: readonly DeepForest[],
    guaranteedOpenings: readonly Opening[],
    links: readonly Link[],
  ): DeepForestLayout => {
    const contains = (p: Vec2) => isUnder(forest, tileCentre(p));
    const glade = gladeOf(forest);

    const isWet = (p: Vec2) =>
      riversNear.some((river) => boundsContain(river.bounds, p) && distanceToRiver(river, p) <= 0);
    const paths = new Set<string>();
    const mouths = new Set<string>();
    const walked = new Set<string>();
    const routeToGlade = (from: Vec2) => {
      const nodes = pathOf(
        route(from, glade, {
          gradeLevel: level,
          isOpen: contains,
          unitCost: (grade, at) =>
            (1 + PATH_WOBBLE * (1 + wobble(at.x / PATH_WOBBLE_SCALE, at.y / PATH_WOBBLE_SCALE)) + climbCost(grade)) *
            (walked.has(tileKey(at.x, at.y)) ? PATH_REUSE : 1) *
            (isWet(at) ? PATH_WATER_PENALTY : 1),
          typicalUnitCost: PATH_TYPICAL_COST,
        }),
      );
      nodes?.forEach((node) => walked.add(tileKey(node.x, node.y)));
      return nodes;
    };
    const notch = (opening: Opening, nodes: readonly Vec2[]) =>
      rasterize(
        [
          opening.outside,
          opening.inside,
          ...nodes
            .slice(0, NOTCH_NODES)
            .filter((node) => distance(node, glade) > glade.radius + NOTCH_NODES * OPENING_STEP),
        ],
        mouths,
      );

    const openings = new Map<string, Opening>();
    const open = (opening: Opening) =>
      openings.set(`${opening.inside.x},${opening.inside.y}>${opening.outside.x},${opening.outside.y}`, opening);
    const stops: Vec2[] = [];
    const joined: Link[] = [];
    for (const run of ways.flatMap(({ nodes }) => runsWithin(nodes, contains))) {
      const ends = [
        run.before ? { outside: run.before, inside: run.inside[0]! } : run.inside[0]!,
        run.after ? { outside: run.after, inside: run.inside.at(-1)! } : run.inside.at(-1)!,
      ];
      const routes = ends.map((end) => ({ end, nodes: routeToGlade("inside" in end ? end.inside : end) }));
      if (routes.every(({ nodes }) => nodes)) {
        for (const { end, nodes } of routes) {
          if (!("outside" in end)) {
            stops.push(end);
            rasterize([end, ...nodes!], paths);
          } else if (isCovered(() => nearby, tileCentre(end.outside), forest)) {
            joined.push({ here: end.inside, there: end.outside });
            rasterize([end.outside, end.inside, ...nodes!], paths);
          } else {
            open(end);
            rasterize([end.outside, end.inside, ...nodes!], paths);
            notch(end, nodes!);
          }
        }
      } else {
        const through = [run.before, ...run.inside, run.after].filter((p) => p !== undefined);
        rasterize(through, paths);
        rasterize(through, mouths);
      }
    }
    for (const opening of guaranteedOpenings) {
      const nodes = routeToGlade(opening.inside);
      if (!nodes) continue;
      open(opening);
      rasterize([opening.outside, opening.inside, ...nodes], paths);
      notch(opening, nodes);
    }
    for (const link of links) {
      const nodes = routeToGlade(link.here);
      if (!nodes) continue;
      joined.push(link);
      rasterize([link.there, link.here, ...nodes], paths);
    }
    return { forest, glade, openings: [...openings.values()], links: joined, stops, contains, paths, mouths, nearby };
  };

  const feature = (waysNear: Stage<readonly WayLink[]>): FeatureType<DeepForest, DeepForestLayout, TileDraft> => ({
    name: "deep forest",
    priority: 0,
    sites: parts,
    reach: DEEP_FOREST_REACH,
    extent: boundsOfForest,
    reads: [
      { stage: waysNear, radius: MARGIN },
      { stage: rivers, radius: MARGIN },
      { stage: parts, radius: REGION_SIZE },
      { stage: guaranteed, radius: 0 },
    ],
    build: (forest, { read, gather }) => {
      const bounds = boundsOfForest(forest);
      const index = read(parts, forest.region).findIndex(({ id }) => id === forest.id);
      return build(
        forest,
        distinctWays(gather(waysNear, bounds)),
        [...new Set(gather(rivers, bounds))],
        gather(parts, expand(bounds, 1)),
        read(guaranteed, forest.region)[index]!,
        linksOf(forest, (region) => read(parts, region)),
      );
    },
    bounds: ({ forest }) => boundsOfForest(forest),
    paint: ({ forest, glade, paths, mouths, nearby }, draft, x, y) => {
      const centre = { x: x + 0.5, y: y + 0.5 };
      const key = tileKey(x, y);
      const isWall = () =>
        NEIGHBOURS.some((o) => {
          const next = { x: centre.x + o.x, y: centre.y + o.y };
          return mouths.has(tileKey(x + o.x, y + o.y)) || !isCovered(() => nearby, next, forest);
        });
      if (paths.has(key)) {
        draft.way = Way.Path;
        draft.prop = draft.water === Water.None ? Prop.None : Prop.Bridge;
        draft.cover = mouths.has(key) ? Cover.None : Cover.Canopy;
        return true;
      }
      if (draft.biome === Biome.Ocean || !isInFootprint(forest, centre)) return false;
      if (draft.forestness < DEEP_FORESTNESS) return false;
      draft.cover = Cover.Canopy;
      if (draft.ground === Ground.Sand) draft.ground = Ground.Grass;
      draft.way = Way.None;
      const roll = rng.unit(x, y);
      if (draft.water !== Water.None) draft.prop = Prop.None;
      else if (isWall()) draft.prop = draft.ground === Ground.Snow || roll < 1 / 3 ? Prop.Pine : Prop.Oak;
      else if (distance(centre, glade) <= glade.radius) draft.prop = roll < 0.2 ? Prop.Flowers : Prop.Tuft;
      else {
        const depth = clamp((draft.forestness - DEEP_FORESTNESS) / SEAM_FORESTNESS, 0, 1);
        const density = lerp(EDGE_DENSITY, CORE_DENSITY, depth);
        const tree = draft.ground === Ground.Snow || roll < density / 3 ? Prop.Pine : Prop.Oak;
        draft.prop = roll < density ? tree : roll < density + UNDERGROWTH * (1 - density) ? Prop.Bush : Prop.None;
      }
      return true;
    },
  });

  return { parts, openings, feature };
};
