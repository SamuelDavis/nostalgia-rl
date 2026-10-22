import { type FeatureType, type Reader, type Stage, type Vec2, boundsOf, distance, rngOf, stage } from "procgen";
import { spawnNear } from "procgen/recipes";
import { MAX_CLIMB, REGION_SIZE, metresToLevels } from "../constants";
import { type PlacedProp, partOf, tilesOf } from "../props";
import { regions } from "../region";
import { type River, distanceToRiver } from "../rivers";
import { Biome, Ground, Prop, Water } from "../terrain";
import { type WayLink, distinctWays, isOnWay } from "../ways";
import { type Anchor, type TileDraft, settle } from "./feature";

export type Camp = Anchor;

interface CampLayout {
  readonly camp: Camp;
  readonly level: number;
  readonly tents: readonly PlacedProp[];
}

export const CAMP_RADIUS = 12;
const CAMP_YARD = 5;
const CAMP_SPACING = 120;
const CAMP_CHANCE = 0.55;
const CAMP_ATTEMPTS = 4;
const CAMP_MARGIN = 32;
const CAMP_FLATNESS = metresToLevels(4);
export const RIVER_CLEARANCE = 10;
const SPAWN_SEARCH_STEP = 16;
const SPAWN_SEARCH_RADIUS = 60 * SPAWN_SEARCH_STEP;
const SEAM_REACH = (CAMP_RADIUS - CAMP_YARD) * MAX_CLIMB;

const TENTS = 3;
const TENT_SPOTS: readonly Vec2[] = [
  [3, -1],
  [2, 2],
  [-1, 3],
  [-4, 2],
  [-5, -1],
  [-4, -4],
  [-1, -5],
  [2, -4],
].map(([x, y]) => ({ x: x!, y: y! }));

const FLATNESS_PROBES: readonly Vec2[] = [
  { x: 6, y: 0 },
  { x: -6, y: 0 },
  { x: 0, y: 6 },
  { x: 0, y: -6 },
  { x: 4, y: 4 },
  { x: -4, y: 4 },
  { x: 4, y: -4 },
  { x: -4, y: -4 },
];

const SEAM_PROBES: readonly Vec2[] = [
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

export interface CampSiting {
  readonly level: (p: Vec2) => number;
  readonly biomeAt: (p: Vec2) => Biome;
  readonly riverBands: Stage<readonly River[]>;
}

export const campSiting = ({ level, biomeAt, riverBands }: CampSiting) => {
  const levelsAround = (p: Vec2, probes: readonly Vec2[]) => probes.map((o) => level({ x: p.x + o.x, y: p.y + o.y }));

  const deviatesBy = (levels: readonly number[], from: number, tolerance: number) =>
    levels.some((l) => Math.abs(l - from) > tolerance);

  const campLevel = (p: Vec2) => {
    const ring = levelsAround(p, SEAM_PROBES).sort((a, b) => a - b);
    return ring[ring.length >> 1]!;
  };

  const isSite = (reader: Reader, p: Vec2): boolean => {
    const biome = biomeAt(p);
    if (biome === Biome.Ocean || biome === Biome.Beach || biome === Biome.Mountain) return false;
    if (deviatesBy(levelsAround(p, FLATNESS_PROBES), level(p), CAMP_FLATNESS)) return false;
    if (deviatesBy(levelsAround(p, SEAM_PROBES), campLevel(p), SEAM_REACH)) return false;
    return reader.readAt(riverBands, p).every((river) => distanceToRiver(river, p) > RIVER_CLEARANCE);
  };

  return { campLevel, isSite, riverBands };
};

export type Siting = ReturnType<typeof campSiting>;

export const findSpawn = (seed: number, reader: Reader, { isSite }: Siting): Camp => {
  const rng = rngOf(seed, "spawn");
  const spawn = spawnNear({
    step: SPAWN_SEARCH_STEP,
    maxRadius: SPAWN_SEARCH_RADIUS,
    isSite: (p) => isSite(reader, p),
  });
  return spawn ? { ...spawn, id: rng.u32(spawn.x, spawn.y) } : { x: 0, y: 0, id: rng.u32(0, 0) };
};

export const createCampSites = (siting: Siting, spawn: Camp) => {
  const spawnRegion = regions.cellOf(spawn);
  return stage({
    name: "camps",
    grid: regions,
    reads: [{ stage: siting.riverBands, radius: 0 }],
    compute: ({ col, row }, context): readonly Camp[] => {
      if (col === spawnRegion.col && row === spawnRegion.row) return [spawn];
      const nearSpawn = Math.abs(col - spawnRegion.col) <= 1 && Math.abs(row - spawnRegion.row) <= 1;
      const { rng } = context;
      if (!nearSpawn && !rng.chance(CAMP_CHANCE, 0)) return [];
      for (let attempt = 0; attempt < CAMP_ATTEMPTS; attempt++) {
        const p = {
          x: col * REGION_SIZE + rng.int(CAMP_MARGIN, REGION_SIZE - CAMP_MARGIN, attempt, 1),
          y: row * REGION_SIZE + rng.int(CAMP_MARGIN, REGION_SIZE - CAMP_MARGIN, attempt, 2),
        };
        if (distance(p, spawn) > CAMP_SPACING && siting.isSite(context, p)) return [{ ...p, id: rng.u32(attempt, 3) }];
      }
      return [];
    },
  });
};

export const campFeature = (
  seed: number,
  siting: Siting,
  sites: Stage<readonly Camp[]>,
  waysNear: Stage<readonly WayLink[]>,
): FeatureType<Camp, CampLayout, TileDraft> => {
  const rng = rngOf(seed, "tents");
  const tentsOf = (camp: Camp, links: readonly WayLink[]): PlacedProp[] =>
    TENT_SPOTS.map((o) => ({ kind: Prop.Tent, at: { x: camp.x + o.x, y: camp.y + o.y } }))
      .filter((tent) => !tilesOf(tent).some((p) => isOnWay(links, p)))
      .sort((a, b) => rng.u32(a.at.x, a.at.y) - rng.u32(b.at.x, b.at.y))
      .slice(0, TENTS);

  return {
    name: "camp",
    priority: 1,
    sites,
    reach: CAMP_RADIUS,
    extent: (camp) => boundsOf([camp], CAMP_RADIUS),
    reads: [{ stage: waysNear, radius: CAMP_RADIUS }],
    build: (camp, { gather }) => ({
      camp,
      level: siting.campLevel(camp),
      tents: tentsOf(camp, distinctWays(gather(waysNear, boundsOf([camp], CAMP_RADIUS)))),
    }),
    bounds: ({ camp }) => boundsOf([camp], CAMP_RADIUS),
    paint: ({ camp, level: campLevel, tents }, draft, x, y) => {
      const gap = distance({ x: x + 0.5, y: y + 0.5 }, { x: camp.x + 0.5, y: camp.y + 0.5 });
      if (gap > CAMP_RADIUS) return false;
      draft.height = settle(draft.height, campLevel, gap - CAMP_YARD);
      draft.water = Water.None;
      if (gap <= CAMP_YARD) draft.ground = Ground.Dirt;
      const p = { x, y };
      const tent = tents.find((t) => partOf(t, p) !== undefined);
      draft.prop = x === camp.x && y === camp.y ? Prop.Campfire : tent ? Prop.Tent : Prop.None;
      draft.part = tent ? partOf(tent, p)! : 0;
      return true;
    },
  };
};
