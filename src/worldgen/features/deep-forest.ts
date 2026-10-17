import {
  type Point,
  clamp,
  createNoise,
  distance,
  hash,
  hashString,
  intBetween,
  lerp,
  memoize,
  projectOntoSegment,
  unit,
} from "../../lib";
import { REGION_SIZE } from "../constants";
import {
  type Bounds,
  type Region,
  boundsOf,
  overlaps,
  regionBounds,
  regionKey,
  regionOf,
  regionsAround,
} from "../region";
import { climbCost, route } from "../routing";
import { Biome, Cover, Ground, Prop, Water, Way } from "../terrain";
import type { Glade } from "../landmarks";
import { CAMP_RADIUS } from "./camp";
import type { Anchor, FeatureType } from "./feature";

export interface DeepForest extends Anchor {
  readonly region: Region;
  readonly cells: ReadonlySet<number>;
  readonly footprintCells: ReadonlySet<number>;
  readonly camps: readonly Point[];
}

export interface Opening {
  readonly outside: Point;
  readonly inside: Point;
}

export interface Link {
  readonly here: Point;
  readonly there: Point;
}

export interface DeepForestLayout {
  readonly forest: DeepForest;
  readonly glade: Glade;
  readonly openings: readonly Opening[];
  readonly links: readonly Link[];
  readonly stops: readonly Point[];
  readonly contains: (p: Point) => boolean;
  readonly paths: ReadonlySet<string>;
  readonly mouths: ReadonlySet<string>;
}

export interface DeepForestSiting {
  readonly seed: number;
  readonly level: (p: Point) => number;
  readonly forestness: (p: Point) => number;
  readonly campAt: (region: Region) => Point | undefined;
  readonly waysNear: (region: Region) => readonly { readonly nodes: readonly Point[] }[];
}

const SALT = hashString("deep forests");
const DEEP_FORESTNESS = 0.7;
const SEAM_FORESTNESS = 0.08;
const CELL = 8;
const CELLS_PER_SIDE = REGION_SIZE / CELL;
const MIN_CELLS = 10;
const MARGIN = 2 * CELL;
const DEEP_FOREST_REACH = REGION_SIZE + MARGIN;
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
const REGION_CACHE = 4096;
const DEEP_TILE_CACHE = 1 << 18;
const TILE_KEY_STRIDE = 1 << 26;

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const AROUND: readonly Point[] = [...NEIGHBOURS, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];

const HEART_REACH: readonly Point[] = Array.from({ length: 25 }, (_, i) => ({
  x: (i % 5) - 2,
  y: Math.floor(i / 5) - 2,
}));

const DIRECTIONS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
];

const along = (from: Point, direction: Point, length: number): Point => ({
  x: from.x + direction.x * length,
  y: from.y + direction.y * length,
});

const cellIndex = (col: number, row: number) => row * CELLS_PER_SIDE + col;

const isCellOnGrid = (col: number, row: number) => col >= 0 && col < CELLS_PER_SIDE && row >= 0 && row < CELLS_PER_SIDE;

const cellTile = ({ rx, ry }: Region, index: number): Point => ({
  x: rx * REGION_SIZE + (index % CELLS_PER_SIDE) * CELL + CELL / 2,
  y: ry * REGION_SIZE + Math.floor(index / CELLS_PER_SIDE) * CELL + CELL / 2,
});

const tileCentre = (p: Point): Point => ({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 });

const isInCamp = (forest: DeepForest, p: Point) =>
  forest.camps.some((camp) => distance(tileCentre(p), { x: camp.x + 0.5, y: camp.y + 0.5 }) <= CAMP_RADIUS);

const colRow = (index: number) => [index % CELLS_PER_SIDE, Math.floor(index / CELLS_PER_SIDE)] as const;

export const gladeOf = (forest: DeepForest): Glade => ({
  x: forest.x,
  y: forest.y,
  radius: intBetween(...GLADE_RADII, hash(forest.id, 1)),
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

const rasterize = (nodes: readonly Point[], tiles: Set<string>) =>
  nodes.forEach((a, i) => {
    const b = nodes[i + 1] ?? a;
    for (let y = Math.floor(Math.min(a.y, b.y)) - 1; y <= Math.floor(Math.max(a.y, b.y)) + 1; y++)
      for (let x = Math.floor(Math.min(a.x, b.x)) - 1; x <= Math.floor(Math.max(a.x, b.x)) + 1; x++)
        if (projectOntoSegment({ x: x + 0.5, y: y + 0.5 }, a, b).distance <= PATH_HALF_WIDTH) tiles.add(tileKey(x, y));
  });

interface Run {
  readonly before?: Point;
  readonly inside: readonly Point[];
  readonly after?: Point;
}

const densely = (nodes: readonly Point[]): Point[] =>
  nodes.flatMap((a, i) => {
    const b = nodes[i + 1];
    if (!b) return [a];
    const steps = Math.max(1, Math.ceil(distance(a, b)));
    return Array.from({ length: steps }, (_, k) => ({
      x: a.x + ((b.x - a.x) * k) / steps,
      y: a.y + ((b.y - a.y) * k) / steps,
    }));
  });

const runsWithin = (nodes: readonly Point[], contains: (p: Point) => boolean): Run[] => {
  const runs: Run[] = [];
  let run: { before?: Point; inside: Point[] } | undefined;
  let previous: Point | undefined;
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

export const createDeepForests = ({ seed, level, forestness, campAt, waysNear }: DeepForestSiting) => {
  const wobble = createNoise(seed, hash(SALT, 1));

  const deepTiles = new Map<number, boolean>();
  const isDeep = (p: Point) => {
    const key = Math.floor(p.x) * TILE_KEY_STRIDE + Math.floor(p.y);
    let deep = deepTiles.get(key);
    if (deep === undefined) {
      if (deepTiles.size >= DEEP_TILE_CACHE) deepTiles.clear();
      deep = forestness(tileCentre(p)) >= DEEP_FORESTNESS;
      deepTiles.set(key, deep);
    }
    return deep;
  };

  const partsIn = memoize(
    (region: Region): DeepForest[] => {
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
      const camps = regionsAround(region, 1).flatMap((other) => {
        const camp = campAt(other);
        return camp && overlaps(boundsOf([camp], CAMP_RADIUS), regionBounds(region)) ? [camp] : [];
      });
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
          id: hash(seed, SALT, region.rx, region.ry, heart),
          region,
          cells,
          footprintCells: new Set([...cells, ...ring]),
          camps,
        };
      });
    },
    regionKey,
    REGION_CACHE,
  );

  const isInFootprint = (forest: DeepForest, p: Point) => {
    const col = Math.floor((p.x - forest.region.rx * REGION_SIZE) / CELL);
    const row = Math.floor((p.y - forest.region.ry * REGION_SIZE) / CELL);
    return isCellOnGrid(col, row) && forest.footprintCells.has(cellIndex(col, row)) && !isInCamp(forest, p);
  };

  const isUnder = (forest: DeepForest, p: Point) => isInFootprint(forest, p) && isDeep(p);

  const isCovered = (p: Point, near: DeepForest) =>
    isInFootprint(near, p) ? isDeep(p) : partsIn(regionOf(p)).some((forest) => isUnder(forest, p));

  const linksOf = (forest: DeepForest): Link[] =>
    NEIGHBOURS.flatMap((o) =>
      partsIn({ rx: forest.region.rx + o.x, ry: forest.region.ry + o.y }).flatMap((other) => {
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
        const pick = hash(seed, SALT, Math.min(forest.id, other.id), Math.max(forest.id, other.id)) % pairs.length;
        return [pairs[pick]!];
      }),
    );

  const guaranteedOpeningsOf = memoize(
    (forest: DeepForest): Opening[] => {
      const contains = (p: Point) => isUnder(forest, tileCentre(p));
      const glade = gladeOf(forest);
      return Array.from({ length: DIRECTIONS.length }, (_, i) => {
        const direction = DIRECTIONS[(hash(forest.id, 2) + i * 3) % DIRECTIONS.length]!;
        let length = glade.radius;
        while (contains(along(forest, direction, length + OPENING_STEP))) length += OPENING_STEP;
        const outside = along(forest, direction, length + OPENING_STEP);
        return isCovered(tileCentre(outside), forest)
          ? undefined
          : { inside: along(forest, direction, length), outside };
      })
        .filter((opening) => opening !== undefined)
        .slice(0, GUARANTEED_OPENINGS);
    },
    (forest) => String(forest.id),
    REGION_CACHE,
  );

  const build = (forest: DeepForest): DeepForestLayout => {
    const contains = (p: Point) => isUnder(forest, tileCentre(p));
    const glade = gladeOf(forest);

    const paths = new Set<string>();
    const mouths = new Set<string>();
    const walked = new Set<string>();
    const routeToGlade = (from: Point) => {
      const nodes = route(from, glade, {
        gradeLevel: level,
        isOpen: contains,
        unitCost: (grade, at) =>
          (1 + PATH_WOBBLE * (1 + wobble(at.x / PATH_WOBBLE_SCALE, at.y / PATH_WOBBLE_SCALE)) + climbCost(grade)) *
          (walked.has(tileKey(at.x, at.y)) ? PATH_REUSE : 1),
        typicalUnitCost: PATH_TYPICAL_COST,
      });
      nodes?.forEach((node) => walked.add(tileKey(node.x, node.y)));
      return nodes && [...nodes, glade];
    };
    const notch = (opening: Opening, nodes: readonly Point[]) =>
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

    const openings: Opening[] = [];
    const stops: Point[] = [];
    const links: Link[] = [];
    const ways = new Set(regionsAround(forest.region, 1).flatMap(waysNear));
    for (const run of [...ways].flatMap(({ nodes }) => runsWithin(nodes, contains))) {
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
          } else if (isCovered(tileCentre(end.outside), forest)) {
            links.push({ here: end.inside, there: end.outside });
            rasterize([end.outside, end.inside, ...nodes!], paths);
          } else {
            openings.push(end);
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
    for (const opening of guaranteedOpeningsOf(forest)) {
      const nodes = routeToGlade(opening.inside);
      if (!nodes) continue;
      openings.push(opening);
      rasterize([opening.outside, opening.inside, ...nodes], paths);
      notch(opening, nodes);
    }
    for (const link of linksOf(forest)) {
      const nodes = routeToGlade(link.here);
      if (!nodes) continue;
      links.push(link);
      rasterize([link.there, link.here, ...nodes], paths);
    }
    return { forest, glade, openings, links, stops, contains, paths, mouths };
  };

  const type: FeatureType<DeepForest, DeepForestLayout> = {
    name: "deep forest",
    priority: 0,
    reach: DEEP_FOREST_REACH,
    bounds: boundsOfForest,
    build,
    paint: ({ forest, glade, paths, mouths }, draft, x, y) => {
      const centre = { x: x + 0.5, y: y + 0.5 };
      const key = tileKey(x, y);
      const isWall = () =>
        NEIGHBOURS.some((o) => {
          const next = { x: centre.x + o.x, y: centre.y + o.y };
          return mouths.has(tileKey(x + o.x, y + o.y)) || !isCovered(next, forest);
        });
      if (paths.has(key)) {
        draft.way = Way.Path;
        draft.prop = draft.water === Water.None ? Prop.None : Prop.Bridge;
        draft.cover = isCovered(centre, forest) && !mouths.has(key) ? Cover.Canopy : Cover.None;
        return true;
      }
      if (draft.biome === Biome.Ocean || !isInFootprint(forest, centre)) return false;
      if (draft.forestness < DEEP_FORESTNESS) return false;
      draft.cover = Cover.Canopy;
      if (draft.ground === Ground.Sand) draft.ground = Ground.Grass;
      draft.way = Way.None;
      const roll = unit(hash(seed, SALT, x, y));
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
  };

  return { partsIn, guaranteedOpeningsOf, type };
};
