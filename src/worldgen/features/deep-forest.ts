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
import { type Region, regionKey, regionOf, regionsAround } from "../region";
import { climbCost, route } from "../routing";
import { Biome, Cover, Ground, Prop, Water, Way } from "../terrain";
import type { Glade } from "../trails";
import { CAMP_RADIUS, type Camp } from "./camp";
import type { Anchor, FeatureType } from "./feature";

export interface DeepForest extends Anchor {
  readonly moisture: number;
  readonly radius: number;
}

export interface Opening {
  readonly outside: Point;
  readonly inside: Point;
}

export interface DeepForestLayout {
  readonly forest: DeepForest;
  readonly glade: Glade;
  readonly openings: readonly Opening[];
  readonly contains: (p: Point) => boolean;
  readonly paths: ReadonlySet<string>;
  readonly mouths: ReadonlySet<string>;
}

export interface DeepForestSiting {
  readonly seed: number;
  readonly level: (p: Point) => number;
  readonly biomeAt: (p: Point) => Biome;
  readonly moisture: (p: Point) => number;
  readonly campAt: (region: Region) => Camp | undefined;
  readonly waysNear: (region: Region) => readonly { readonly nodes: readonly Point[] }[];
}

const SALT = hashString("deep forests");
const DEEP_MOISTURE = 0.72;
const MIN_RADIUS = 48;
const MAX_RADIUS = 80;
const RAGGEDNESS = 0.3;
const RAGGED_SCALE = 30;
export const DEEP_FOREST_REACH = Math.ceil(MAX_RADIUS * (1 + RAGGEDNESS));
const PROBE = 32;
const PROBES_PER_SIDE = REGION_SIZE / PROBE;
const MIN_FOREST_RING = 6;
const GUARANTEED_OPENINGS = 2;
const OPENING_STEP = 2;
const GLADE_RADII = [5, 8] as const;
const SEAM = 10;
const EDGE_DENSITY = 0.45;
const CORE_DENSITY = 0.85;
const UNDERGROWTH = 0.4;
const PATH_HALF_WIDTH = 0.8;
const PATH_WOBBLE = 1.5;
const PATH_WOBBLE_SCALE = 12;
const PATH_REUSE = 0.35;
const PATH_TYPICAL_COST = 2;
const REGION_CACHE = 4096;

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

export const gladeOf = (forest: DeepForest): Glade => ({
  x: forest.x,
  y: forest.y,
  radius: intBetween(...GLADE_RADII, hash(forest.id, 1)),
});

const tileKey = (x: number, y: number) => `${x},${y}`;

const rasterize = (nodes: readonly Point[], tiles: Set<string>) =>
  nodes.forEach((a, i) => {
    const b = nodes[i + 1] ?? a;
    for (let y = Math.floor(Math.min(a.y, b.y)) - 1; y <= Math.floor(Math.max(a.y, b.y)) + 1; y++)
      for (let x = Math.floor(Math.min(a.x, b.x)) - 1; x <= Math.floor(Math.max(a.x, b.x)) + 1; x++)
        if (projectOntoSegment({ x: x + 0.5, y: y + 0.5 }, a, b).distance <= PATH_HALF_WIDTH) tiles.add(tileKey(x, y));
  });

export const createDeepForests = ({ seed, level, biomeAt, moisture, campAt, waysNear }: DeepForestSiting) => {
  const ragged = createNoise(seed, SALT);
  const wobble = createNoise(seed, hash(SALT, 1));

  const depthIn = (forest: DeepForest, p: Point) =>
    (1 - distance(p, forest) / forest.radius - RAGGEDNESS * ragged(p.x / RAGGED_SCALE, p.y / RAGGED_SCALE)) *
    forest.radius;

  const tileCentre = (p: Point): Point => ({ x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 });
  const isForest = (p: Point) => biomeAt(tileCentre(p)) === Biome.Forest;

  const candidate = memoize(
    ({ cx, cy }: Region): DeepForest | undefined => {
      const probes = Array.from({ length: PROBES_PER_SIDE * PROBES_PER_SIDE }, (_, i) => ({
        x: cx * REGION_SIZE + (i % PROBES_PER_SIDE) * PROBE + PROBE / 2,
        y: cy * REGION_SIZE + Math.floor(i / PROBES_PER_SIDE) * PROBE + PROBE / 2,
      }))
        .filter(isForest)
        .map((p) => ({ ...p, moisture: moisture(p) }));
      const wettest = probes.reduce<(typeof probes)[number] | undefined>(
        (best, p) => (!best || p.moisture > best.moisture ? p : best),
        undefined,
      );
      if (!wettest || wettest.moisture < DEEP_MOISTURE) return undefined;
      const id = hash(seed, SALT, cx, cy);
      return {
        x: wettest.x,
        y: wettest.y,
        id,
        moisture: wettest.moisture,
        radius: intBetween(MIN_RADIUS, MAX_RADIUS, id),
      };
    },
    regionKey,
    REGION_CACHE,
  );

  const outranks = (a: DeepForest, b: DeepForest) =>
    a.moisture > b.moisture || (a.moisture === b.moisture && a.id > b.id);

  const isClearOfCamps = (forest: DeepForest) =>
    regionsAround(regionOf(forest), 1).every((region) => {
      const camp = campAt(region);
      return !camp || distance(camp, forest) > DEEP_FOREST_REACH + CAMP_RADIUS;
    });

  const at = memoize(
    (region: Region): DeepForest | undefined => {
      const forest = candidate(region);
      if (!forest) return undefined;
      const crowded = regionsAround(region, 1).some((other) => {
        const rival = candidate(other);
        return rival && rival !== forest && distance(rival, forest) < 2 * DEEP_FOREST_REACH && outranks(rival, forest);
      });
      if (crowded || !isClearOfCamps(forest)) return undefined;
      const inForest = DIRECTIONS.filter((d) => isForest(along(forest, d, forest.radius / 2))).length;
      return inForest >= MIN_FOREST_RING ? forest : undefined;
    },
    regionKey,
    REGION_CACHE,
  );

  const build = (forest: DeepForest): DeepForestLayout => {
    const contains = (p: Point) => depthIn(forest, tileCentre(p)) > 0 && biomeAt(tileCentre(p)) !== Biome.Ocean;
    const glade = gladeOf(forest);

    const ways = new Set(regionsAround(regionOf(forest), 1).flatMap(waysNear));
    const crossings = [...ways].flatMap(({ nodes }) =>
      nodes.flatMap((a, i) => {
        const b = nodes[i + 1];
        if (!b || contains(a) === contains(b)) return [];
        return [contains(a) ? { outside: b, inside: a } : { outside: a, inside: b }];
      }),
    );
    const guaranteed = Array.from({ length: GUARANTEED_OPENINGS }, (_, i): Opening => {
      const direction =
        DIRECTIONS[(hash(forest.id, 2) + i * (DIRECTIONS.length / GUARANTEED_OPENINGS)) % DIRECTIONS.length]!;
      let length = glade.radius;
      while (contains(along(forest, direction, length + OPENING_STEP))) length += OPENING_STEP;
      return { inside: along(forest, direction, length), outside: along(forest, direction, length + OPENING_STEP) };
    });
    const openings = [...crossings, ...guaranteed];

    const paths = new Set<string>();
    const mouths = new Set<string>();
    const walked = new Set<string>();
    for (const opening of openings) {
      const nodes = route(opening.inside, glade, {
        gradeLevel: level,
        isOpen: contains,
        unitCost: (grade, at) =>
          (1 + PATH_WOBBLE * (1 + wobble(at.x / PATH_WOBBLE_SCALE, at.y / PATH_WOBBLE_SCALE)) + climbCost(grade)) *
          (walked.has(tileKey(at.x, at.y)) ? PATH_REUSE : 1),
        typicalUnitCost: PATH_TYPICAL_COST,
      }) ?? [glade];
      nodes.forEach((node) => walked.add(tileKey(node.x, node.y)));
      rasterize([opening.outside, opening.inside, ...nodes, glade], paths);
      rasterize([opening.outside, opening.inside], mouths);
    }
    return { forest, glade, openings, contains, paths, mouths };
  };

  const type: FeatureType<DeepForest, DeepForestLayout> = {
    name: "deep forest",
    priority: 0,
    reach: DEEP_FOREST_REACH,
    build,
    paint: ({ forest, glade, paths, mouths }, draft, x, y) => {
      const centre = { x: x + 0.5, y: y + 0.5 };
      const key = tileKey(x, y);
      const inside = draft.biome !== Biome.Ocean && depthIn(forest, centre) > 0;
      if (paths.has(key)) {
        draft.way = Way.Path;
        draft.prop = draft.water === Water.None ? Prop.None : Prop.Bridge;
        draft.cover = inside && !mouths.has(key) ? Cover.Canopy : Cover.None;
        return true;
      }
      if (!inside) return false;
      draft.cover = Cover.Canopy;
      if (draft.ground === Ground.Sand) draft.ground = Ground.Grass;
      draft.way = Way.None;
      const roll = unit(hash(seed, SALT, x, y));
      if (draft.water !== Water.None) draft.prop = Prop.None;
      else if (distance(centre, glade) <= glade.radius) draft.prop = roll < 0.2 ? Prop.Flowers : Prop.Tuft;
      else {
        const density = lerp(EDGE_DENSITY, CORE_DENSITY, clamp(depthIn(forest, centre) / SEAM, 0, 1));
        const tree = draft.ground === Ground.Snow || roll < density / 3 ? Prop.Pine : Prop.Oak;
        draft.prop = roll < density ? tree : roll < density + UNDERGROWTH * (1 - density) ? Prop.Bush : Prop.None;
      }
      return true;
    },
  };

  return { at, type };
};
