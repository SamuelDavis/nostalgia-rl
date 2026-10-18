import { type Point, distance, hash, hashString, intBetween, memoize, projectOntoSegment, unit } from "../../lib";
import { MAX_CLIMB, REGION_SIZE, metresToLevels } from "../constants";
import { type PlacedProp, partOf, tilesOf } from "../props";
import { type Region, boundsOf, regionKey, regionOf, regionsAround } from "../region";
import { type River, distanceToRiver } from "../rivers";
import { Biome, Ground, Prop, Water } from "../terrain";
import { WAY_SHAPES, type WayLink } from "../ways";
import type { Anchor, FeatureType } from "./feature";

export type Camp = Anchor;

interface CampLayout {
  readonly camp: Camp;
  readonly level: number;
  readonly tents: readonly PlacedProp[];
}

export interface CampSiting {
  readonly seed: number;
  readonly level: (p: Point) => number;
  readonly biomeAt: (p: Point) => Biome;
  readonly riversNear: (region: Region) => readonly River[];
  readonly waysNear: (region: Region) => readonly WayLink[];
}

export const CAMP_RADIUS = 12;
const CAMP_YARD = 5;
const CAMP_SPACING = 120;
const CAMP_CHANCE = 0.55;
const CAMP_ATTEMPTS = 4;
const CAMP_MARGIN = 32;
const CAMP_FLATNESS = metresToLevels(4);
const RIVER_CLEARANCE = 10;
const SPAWN_SEARCH_STEP = 16;
const SPAWN_SEARCH_RINGS = 60;
const REGION_CACHE = 4096;
const SALT = hashString("camps");
const SEAM_REACH = (CAMP_RADIUS - CAMP_YARD) * MAX_CLIMB;

const TENTS = 3;
const TENT_SPOTS: readonly Point[] = [
  [3, -1],
  [2, 2],
  [-1, 3],
  [-4, 2],
  [-5, -1],
  [-4, -4],
  [-1, -5],
  [2, -4],
].map(([x, y]) => ({ x: x!, y: y! }));

const FLATNESS_PROBES: readonly Point[] = [
  { x: 6, y: 0 },
  { x: -6, y: 0 },
  { x: 0, y: 6 },
  { x: 0, y: -6 },
  { x: 4, y: 4 },
  { x: -4, y: 4 },
  { x: 4, y: -4 },
  { x: -4, y: -4 },
];

const SEAM_PROBES: readonly Point[] = [
  [13, 0],
  [12, 5],
  [9, 9],
  [5, 12],
].flatMap(([a, b]) => [
  { x: a!, y: b! },
  { x: -b!, y: a! },
  { x: -a!, y: -b! },
  { x: b!, y: -a! },
]);

const settle = (level: number, campLevel: number, gap: number): number => {
  const slack = Math.ceil(Math.max(0, gap - CAMP_YARD)) * MAX_CLIMB;
  return Math.min(campLevel + slack, Math.max(campLevel - slack, level));
};

export const createCamps = ({ seed, level, biomeAt, riversNear, waysNear }: CampSiting) => {
  const levelsAround = (p: Point, probes: readonly Point[]) => probes.map((o) => level({ x: p.x + o.x, y: p.y + o.y }));

  const deviatesBy = (levels: readonly number[], from: number, tolerance: number) =>
    levels.some((l) => Math.abs(l - from) > tolerance);

  const campLevel = (p: Point) => {
    const ring = levelsAround(p, SEAM_PROBES).sort((a, b) => a - b);
    return ring[ring.length >> 1]!;
  };

  const isSite = (p: Point): boolean => {
    const biome = biomeAt(p);
    if (biome === Biome.Ocean || biome === Biome.Beach || biome === Biome.Mountain) return false;
    if (deviatesBy(levelsAround(p, FLATNESS_PROBES), level(p), CAMP_FLATNESS)) return false;
    if (deviatesBy(levelsAround(p, SEAM_PROBES), campLevel(p), SEAM_REACH)) return false;
    return riversNear(regionOf(p)).every((river) => distanceToRiver(river, p) > RIVER_CLEARANCE);
  };

  const findSpawn = (): Camp => {
    for (let ring = 0; ring <= SPAWN_SEARCH_RINGS; ring++)
      for (let i = 0; i < Math.max(1, ring * 8); i++) {
        const side = Math.floor(i / Math.max(1, ring * 2));
        const along = (i % Math.max(1, ring * 2)) - ring;
        const [gx, gy] = [
          [along, -ring],
          [ring, along],
          [-along, ring],
          [-ring, -along],
        ][side]!;
        const p = { x: gx! * SPAWN_SEARCH_STEP, y: gy! * SPAWN_SEARCH_STEP };
        if (isSite(p)) return { ...p, id: hash(seed, SALT, p.x, p.y) };
      }
    return { x: 0, y: 0, id: hash(seed, SALT) };
  };

  const spawn = findSpawn();
  const spawnRegion = regionOf(spawn);

  const at = memoize(
    ({ rx, ry }: Region): Camp | undefined => {
      if (rx === spawnRegion.rx && ry === spawnRegion.ry) return spawn;
      const nearSpawn = Math.abs(rx - spawnRegion.rx) <= 1 && Math.abs(ry - spawnRegion.ry) <= 1;
      if (!nearSpawn && unit(hash(seed, SALT, rx, ry)) > CAMP_CHANCE) return undefined;
      for (let attempt = 0; attempt < CAMP_ATTEMPTS; attempt++) {
        const p = {
          x:
            rx * REGION_SIZE + intBetween(CAMP_MARGIN, REGION_SIZE - CAMP_MARGIN, hash(seed, SALT, rx, ry, attempt, 1)),
          y:
            ry * REGION_SIZE + intBetween(CAMP_MARGIN, REGION_SIZE - CAMP_MARGIN, hash(seed, SALT, rx, ry, attempt, 2)),
        };
        if (distance(p, spawn) > CAMP_SPACING && isSite(p)) return { ...p, id: hash(seed, SALT, rx, ry) };
      }
      return undefined;
    },
    regionKey,
    REGION_CACHE,
  );

  const isOnWay = (links: readonly WayLink[], p: Point) =>
    links.some(({ nodes, way }) =>
      nodes.some((a, i) => {
        const b = nodes[i + 1];
        return b && projectOntoSegment({ x: p.x + 0.5, y: p.y + 0.5 }, a, b).distance <= WAY_SHAPES[way].halfWidth;
      }),
    );

  const tentsOf = (camp: Camp): PlacedProp[] => {
    const links = regionsAround(regionOf(camp), 1).flatMap(waysNear);
    return TENT_SPOTS.map((o) => ({ kind: Prop.Tent, at: { x: camp.x + o.x, y: camp.y + o.y } }))
      .filter((tent) => !tilesOf(tent).some((p) => isOnWay(links, p)))
      .sort((a, b) => hash(seed, SALT, a.at.x, a.at.y) - hash(seed, SALT, b.at.x, b.at.y))
      .slice(0, TENTS);
  };

  const type: FeatureType<Camp, CampLayout> = {
    name: "camp",
    priority: 1,
    reach: CAMP_RADIUS,
    bounds: (camp) => boundsOf([camp], CAMP_RADIUS),
    build: (camp) => ({ camp, level: campLevel(camp), tents: tentsOf(camp) }),
    paint: ({ camp, level: campLevel, tents }, draft, x, y) => {
      const gap = distance({ x: x + 0.5, y: y + 0.5 }, { x: camp.x + 0.5, y: camp.y + 0.5 });
      if (gap > CAMP_RADIUS) return false;
      draft.height = settle(draft.height, campLevel, gap);
      draft.water = Water.None;
      if (gap <= CAMP_YARD) draft.ground = Ground.Dirt;
      const p = { x, y };
      const tent = tents.find((t) => partOf(t, p) !== undefined);
      draft.prop = x === camp.x && y === camp.y ? Prop.Campfire : tent ? Prop.Tent : Prop.None;
      draft.part = tent ? partOf(tent, p)! : 0;
      return true;
    },
  };

  return { spawn, at, type };
};
