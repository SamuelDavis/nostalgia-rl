import { Cover, Prop, Ground, Water, Way } from "./terrain";
import { type Point, createNoise, distance, floorDiv, hash, hashString, projectOntoSegment, unit } from "../lib";
import { BIOMES, biomeOf } from "./biome";
import { type TileDraft, paintInOrder } from "./features/feature";
import { CHUNK_SIZE, REGION_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import type { RiverNode } from "./rivers";
import type { Worldgen } from "./world";

export interface Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly height: Uint8Array;
  readonly ground: Uint8Array;
  readonly water: Uint8Array;
  readonly prop: Uint8Array;
  readonly biome: Uint8Array;
  readonly way: Uint8Array;
  readonly cover: Uint8Array;
}

export const tileIndex = (lx: number, ly: number): number => ly * CHUNK_SIZE + lx;

const TILES = CHUNK_SIZE * CHUNK_SIZE;
const BANK_WIDTH = 12;
const ROAD_HALF_WIDTH = 1.1;
const ROAD_CLEARANCE = 1.5;
const TRAIL_HALF_WIDTH = 0.8;
const TRAIL_CLEARANCE = 0.6;
const VEGETATION_SALT = hashString("vegetation");
const DECORATION_SALT = hashString("decoration");
const GROVE_SALT = hashString("groves");
const GROUND_SALT = hashString("ground");

interface Channel {
  readonly a: RiverNode;
  readonly b: RiverNode;
}

interface WaySegment {
  readonly a: Point;
  readonly b: Point;
  readonly kind: Way;
  readonly halfWidth: number;
  readonly clearance: number;
}

interface Pool extends Point {
  readonly radius: number;
  readonly level: number;
}

const bankRise = (gap: number): number => Math.ceil(gap) * MAX_CLIMB;

export const generateChunk = (world: Worldgen, cx: number, cy: number): Chunk => {
  const { seed, fields } = world;
  const originX = cx * CHUNK_SIZE;
  const originY = cy * CHUNK_SIZE;
  const region = {
    cx: floorDiv(originX, REGION_SIZE),
    cy: floorDiv(originY, REGION_SIZE),
  };
  const reach = 8;
  const near = (p: Point, margin: number) =>
    p.x >= originX - margin &&
    p.x <= originX + CHUNK_SIZE + margin &&
    p.y >= originY - margin &&
    p.y <= originY + CHUNK_SIZE + margin;
  const segmentNear = (a: Point, b: Point, margin: number) =>
    near({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, margin + distance(a, b) / 2);

  const rivers = world.riversNear(region.cx, region.cy);
  const channels: Channel[] = rivers.flatMap((river) =>
    river.nodes.flatMap((a, i) => {
      const b = river.nodes[i + 1];
      return b && segmentNear(a, b, b.halfWidth + BANK_WIDTH + reach) ? [{ a, b }] : [];
    }),
  );
  const pools: Pool[] = rivers.flatMap((river) =>
    river.lake && near(river.lake, river.lake.radius + BANK_WIDTH) ? [river.lake] : [],
  );
  const segmentsOf = (
    ways: readonly { readonly nodes: readonly Point[] }[],
    kind: Way,
    halfWidth: number,
    clearance: number,
  ): WaySegment[] =>
    ways.flatMap((way) =>
      way.nodes.flatMap((a, i) => {
        const b = way.nodes[i + 1];
        return b && segmentNear(a, b, reach) ? [{ a, b, kind, halfWidth, clearance }] : [];
      }),
    );
  const waySegments = [
    ...segmentsOf(world.roadsNear(region.cx, region.cy), Way.Road, ROAD_HALF_WIDTH, ROAD_CLEARANCE),
    ...segmentsOf(world.trailsNear(region.cx, region.cy), Way.Path, TRAIL_HALF_WIDTH, TRAIL_CLEARANCE),
  ];
  const glades = world.gladesNear(region.cx, region.cy).filter((glade) => near(glade, glade.radius));
  const features = world.featuresNear(region.cx, region.cy).filter((f) => near(f.anchor, f.reach));
  const groves = createNoise(seed, GROVE_SALT);
  const frostEdge = createNoise(seed, GROUND_SALT);

  const height = new Uint8Array(TILES);
  const ground = new Uint8Array(TILES);
  const water = new Uint8Array(TILES);
  const prop = new Uint8Array(TILES);
  const biome = new Uint8Array(TILES);
  const ways = new Uint8Array(TILES);
  const covers = new Uint8Array(TILES);

  for (let ly = 0; ly < CHUNK_SIZE; ly++)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const i = tileIndex(lx, ly);
      const x = originX + lx;
      const y = originY + ly;
      const center = { x: x + 0.5, y: y + 0.5 };
      const climate = fields.climate(center.x, center.y);
      const { elevation, temperature } = climate;
      const tileBiome = biomeOf(climate);
      const traits = BIOMES[tileBiome];
      let level = heightLevel(elevation);
      let tileWater: Water = Water.None;
      let tileGround = traits.ground(level, temperature + frostEdge(x / 7, y / 7) * 0.035);

      const isSea = level < SEA_LEVEL;
      if (isSea) {
        tileWater = level < SEA_LEVEL - 1 ? Water.Deep : Water.Shallow;
        level = SEA_LEVEL - 1;
      }

      for (const pool of pools) {
        const gap = distance(center, pool) - pool.radius;
        if (gap <= 0) {
          tileWater = gap <= -2 ? Water.Deep : Water.Shallow;
          level = Math.min(level, pool.level);
        } else if (gap <= BANK_WIDTH) level = Math.min(level, pool.level + bankRise(gap));
      }

      for (const { a, b } of channels) {
        const projection = projectOntoSegment(center, a, b);
        const gap = projection.distance - b.halfWidth;
        const bed = Math.round(a.level + (b.level - a.level) * projection.t);
        if (gap <= 0) {
          if (tileWater !== Water.Deep) tileWater = b.halfWidth >= 2 && gap <= -1 ? Water.Deep : Water.Shallow;
          level = Math.min(level, bed);
        } else if (gap <= BANK_WIDTH) level = Math.min(level, bed + bankRise(gap));
      }

      const nearWater =
        tileWater === Water.None &&
        channels.some(({ a, b }) => projectOntoSegment(center, a, b).distance - b.halfWidth <= 1.5);

      const wayDistance = (way: WaySegment) => projectOntoSegment(center, way.a, way.b).distance;
      const way = isSea ? undefined : waySegments.find((w) => wayDistance(w) <= w.halfWidth);
      const nearWay = waySegments.some((w) => wayDistance(w) <= w.halfWidth + w.clearance);
      const inGlade = glades.some((glade) => distance(center, glade) <= glade.radius);

      const draft: TileDraft = {
        height: level,
        ground: tileGround,
        water: tileWater,
        prop: way && tileWater !== Water.None ? Prop.Bridge : Prop.None,
        way: way?.kind ?? Way.None,
        cover: Cover.None,
        biome: tileBiome,
      };
      const claimed = paintInOrder(features, draft, x, y);
      if (!claimed && !way && draft.water === Water.None && !nearWater && !nearWay) {
        const roll = unit(hash(seed, VEGETATION_SALT, x, y));
        if (!inGlade && roll < traits.treeDensity(groves(x / 40, y / 40))) draft.prop = traits.tree(temperature);
        else draft.prop = traits.decoration(unit(hash(seed, DECORATION_SALT, x, y)));
      }

      height[i] = draft.height;
      ground[i] = draft.water === Water.None ? draft.ground : Ground.Sand;
      water[i] = draft.water;
      prop[i] = draft.prop;
      biome[i] = tileBiome;
      ways[i] = draft.way;
      covers[i] = draft.cover;
    }

  return { cx, cy, height, ground, water, prop, biome, way: ways, cover: covers };
};
