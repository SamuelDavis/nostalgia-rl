import {
  type Bounds,
  type Draft,
  type FeatureType,
  type Link,
  type Placed,
  type Vec2,
  createRaster,
  defineFields,
  boundsOf,
  distance,
  distanceToPolyline,
  featuresNear,
  fbm,
  footprints,
  forEachTile,
  grid,
  nearestZone,
  network,
  paintFeatures,
  rngOf,
  routeOnGrid,
  scatter,
  simplex2,
  smoothstep,
  spaced,
  sprinkle,
  stage,
} from "../src";

export const Zone = { Sea: 0, Beach: 1, Meadow: 2, Forest: 3, Desert: 4, Mountain: 5 } as const;
export type Zone = (typeof Zone)[keyof typeof Zone];
export const Prop = { None: 0, Tree: 1, Hut: 2, Well: 3 } as const;
export type Prop = (typeof Prop)[keyof typeof Prop];

const SEA_LEVEL = 0;
const ROAD_HALF_WIDTH = 1;

interface Conditions {
  readonly elevation: number;
  readonly moisture: number;
  readonly heat: number;
  readonly forestness: number;
  readonly zone: Zone;
}

const zoneOf = nearestZone<"elevation" | "moisture" | "heat", Zone>([
  { zone: Zone.Sea, at: { elevation: [-1, SEA_LEVEL] } },
  { zone: Zone.Beach, at: { elevation: [SEA_LEVEL, 0.04] } },
  { zone: Zone.Mountain, at: { elevation: [0.45, 1] } },
  { zone: Zone.Desert, at: { elevation: [0.04, 0.45], heat: [0.6, 1], moisture: [-1, 0] } },
  { zone: Zone.Forest, at: { elevation: [0.04, 0.45], moisture: [0.15, 1] } },
  { zone: Zone.Meadow, at: { elevation: [0.04, 0.45], moisture: [-0.3, 0.15] } },
]);

export const createIsland = (seed: number) => {
  const rng = rngOf(seed, "island");
  const elevationNoise = fbm(simplex2(rng.child("elevation").key), { octaves: 5, frequency: 1 / 160 });
  const moistureNoise = fbm(simplex2(rng.child("moisture").key), { octaves: 3, frequency: 1 / 200 });
  const heatNoise = fbm(simplex2(rng.child("heat").key), { octaves: 2, frequency: 1 / 400 });

  const elevationAt = (x: number, y: number) => elevationNoise(x, y) * 1.4 + 0.1;
  const conditionsAt = defineFields<[x: number, y: number], Conditions>({
    elevation: (_, x, y) => elevationAt(x, y),
    moisture: (_, x, y) => moistureNoise(x, y),
    heat: (_, x, y) => (heatNoise(x, y) + 1) / 2,
    forestness: (at) => smoothstep(0.1, 0.5, at.moisture) * (1 - smoothstep(0.3, 0.45, at.elevation)),
    zone: (at) => zoneOf(at),
  });
  const isLand = (p: Vec2) => elevationAt(p.x, p.y) > 0.04;

  const towns = grid(128);
  const townSites = stage({
    name: "town sites",
    grid: towns,
    compute: (cell, { rng: sites }) => {
      const candidates = scatter({ grid: towns, rng: sites, margin: 16 });
      const rank = (p: Vec2) => sites.unit(p.x, p.y);
      return spaced((c) => candidates(c).filter(isLand), { grid: towns, radius: 96, rank })(cell).filter(
        (p) => conditionsAt(p.x, p.y).zone === Zone.Meadow,
      );
    },
  });

  const roads = network<Vec2, null>({
    name: "roads",
    nodes: townSites,
    reach: 260,
    spread: 48,
    join: (from, to) => {
      const path = routeOnGrid({
        from,
        to,
        step: 4,
        margin: 40,
        heuristicCostPerUnit: 1,
        maxExpansions: 4000,
        cost: (a, b) => {
          if (!isLand(b) || !isLand({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })) return Infinity;
          return distance(a, b) * (1 + 400 * Math.abs(elevationAt(a.x, a.y) - elevationAt(b.x, b.y)));
        },
      });
      return path && { edge: null, path };
    },
  });

  const props = footprints<Prop>({ [Prop.Hut]: { x: 3, y: 2 } });
  const schema = { zone: Uint8Array, height: Uint8Array, road: Uint8Array, prop: Uint8Array, part: Uint8Array };
  type Tile = Draft<typeof schema>;
  const HUT_SPOTS: readonly Vec2[] = [
    { x: -7, y: -6 },
    { x: 4, y: -6 },
    { x: -7, y: 5 },
    { x: 4, y: 5 },
  ];
  const town: FeatureType<Vec2, { centre: Vec2; huts: { kind: Prop; at: Vec2 }[] }, Tile> = {
    name: "town",
    priority: 0,
    sites: townSites,
    reach: 10,
    build: (centre, { rng: town }) => ({
      centre,
      huts: HUT_SPOTS.filter((_, i) => town.chance(0.75, centre.x, centre.y, i)).map((spot) => ({
        kind: Prop.Hut,
        at: { x: centre.x + spot.x, y: centre.y + spot.y },
      })),
    }),
    bounds: ({ centre }) => boundsOf([centre], 10),
    paint: ({ centre, huts }, draft, x, y) => {
      const p = { x, y };
      if (distance(p, centre) > 9.5) return false;
      const hut = huts.find((h) => props.partOf(h, p) !== undefined);
      draft.zone = Zone.Meadow;
      draft.prop = hut ? hut.kind : x === centre.x && y === centre.y ? Prop.Well : Prop.None;
      draft.part = hut ? props.partOf(hut, p)! : 0;
      return true;
    },
  };

  const CHUNK = 32;
  const chunks = grid(CHUNK);
  const townsNear = featuresNear<Tile>("towns near chunks", chunks, [town]);
  const roadsNear = roads.near(chunks);
  const trees = sprinkle(rng.child("trees"), (x, y) => 0.35 * conditionsAt(x, y).forestness);
  const paintArea = (area: Bounds, placed: readonly Placed<Tile>[], links: readonly Link<Vec2, null>[]) => {
    const raster = createRaster(schema, {
      origin: { x: area.minX, y: area.minY },
      width: area.maxX - area.minX + 1,
      height: area.maxY - area.minY + 1,
    });
    forEachTile(raster, (draft, x, y) => {
      const at = conditionsAt(x, y);
      draft.zone = at.zone;
      draft.height = Math.round(Math.max(0, at.elevation) * 200);
      draft.road = links.some(({ path }) => distanceToPolyline({ x: x + 0.5, y: y + 0.5 }, path) <= ROAD_HALF_WIDTH)
        ? 1
        : 0;
      const claimed = paintFeatures(placed, draft, x, y);
      if (!claimed && !draft.road && at.zone !== Zone.Sea && trees(x, y)) draft.prop = Prop.Tree;
    });
    return raster;
  };

  const chunkAt = stage({
    name: "island chunks",
    grid: chunks,
    cache: 256,
    reads: [
      { stage: townsNear, radius: 0 },
      { stage: roadsNear, radius: 0 },
    ],
    compute: (cell, { read }) => paintArea(chunks.boundsOf(cell), read(townsNear, cell), read(roadsNear, cell)),
  });

  return { conditionsAt, townSites, roads, chunks, townsNear, roadsNear, chunkAt, paintArea };
};

export type Island = ReturnType<typeof createIsland>;
