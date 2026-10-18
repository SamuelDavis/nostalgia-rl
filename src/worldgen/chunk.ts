import { Cover, Prop, Ground, Water, Way } from "./terrain";
import { type Point, distance, hash, hashString, projectOntoSegment, unit } from "../lib";
import { BIOMES, biomeOf } from "./biome";
import { type TileDraft, paintInOrder } from "./features/feature";
import { CHUNK_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import type { RiverNode } from "./rivers";
import { overlaps, regionOf } from "./region";
import type { LinkedWay } from "./ways";
import type { Worldgen } from "./world";
import { type Layer, SURFACE, layerKey } from "./layer";

export interface Chunk {
  readonly layer: Layer;
  readonly cx: number;
  readonly cy: number;
  readonly height: Int16Array;
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
const BANK_SLOPE = MAX_CLIMB * 0.75;
const WAY_SHAPES: Record<LinkedWay, { readonly halfWidth: number; readonly clearance: number }> = {
  [Way.Road]: { halfWidth: 1.1, clearance: 1.5 },
  [Way.Path]: { halfWidth: 0.8, clearance: 0.6 },
};
export const FADE_LENGTH = 24;
const FADE_SALT = hashString("way fades");
const VEGETATION_SALT = hashString("vegetation");
const DECORATION_SALT = hashString("decoration");

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
  readonly fades: readonly Point[];
}

interface Pool extends Point {
  readonly radius: number;
  readonly level: number;
}

const bankLevel = (bed: number, gap: number): number => Math.floor(bed + gap * BANK_SLOPE);

export const chunkOn = (world: Worldgen, layer: Layer, cx: number, cy: number): Chunk => {
  if (layer !== SURFACE) throw new Error(`no generator for ${layerKey(layer)}`);
  return generateChunk(world, cx, cy);
};

export const generateChunk = (world: Worldgen, cx: number, cy: number): Chunk => {
  const { seed, fields } = world;
  const originX = cx * CHUNK_SIZE;
  const originY = cy * CHUNK_SIZE;
  const region = regionOf({ x: originX, y: originY });
  const reach = 8;
  const near = (p: Point, margin: number) =>
    p.x >= originX - margin &&
    p.x <= originX + CHUNK_SIZE + margin &&
    p.y >= originY - margin &&
    p.y <= originY + CHUNK_SIZE + margin;
  const segmentNear = (a: Point, b: Point, margin: number) =>
    near({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, margin + distance(a, b) / 2);

  const rivers = world.riversNear(region);
  const channels: Channel[] = rivers.flatMap((river) =>
    river.nodes.flatMap((a, i) => {
      const b = river.nodes[i + 1];
      return b && segmentNear(a, b, b.halfWidth + BANK_WIDTH + reach) ? [{ a, b }] : [];
    }),
  );
  const pools: Pool[] = rivers.flatMap((river) =>
    river.lake && near(river.lake, river.lake.radius + BANK_WIDTH) ? [river.lake] : [],
  );
  const waySegments: WaySegment[] = world.waysNear(region).flatMap(({ nodes, way, fades }) =>
    nodes.flatMap((a, i) => {
      const b = nodes[i + 1];
      return b && segmentNear(a, b, reach) ? [{ a, b, kind: way, fades, ...WAY_SHAPES[way] }] : [];
    }),
  );
  const features = world
    .featuresNear(region)
    .filter(({ bounds }) =>
      overlaps(bounds, { minX: originX, minY: originY, maxX: originX + CHUNK_SIZE, maxY: originY + CHUNK_SIZE }),
    );

  const height = new Int16Array(TILES);
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
      const conditions = fields.conditions(center.x, center.y);
      const { elevation, temperature } = conditions;
      const tileBiome = biomeOf(conditions);
      const traits = BIOMES[tileBiome];
      let level = heightLevel(elevation);
      let tileWater: Water = Water.None;
      let tileGround = traits.ground(level, temperature + fields.frostEdge(x, y) * 0.035);

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
        } else if (gap <= BANK_WIDTH) level = Math.min(level, bankLevel(pool.level, gap));
      }

      for (const { a, b } of channels) {
        const projection = projectOntoSegment(center, a, b);
        const gap = projection.distance - b.halfWidth;
        const bed = a.level + (b.level - a.level) * projection.t;
        if (gap <= 0) {
          if (tileWater !== Water.Deep) tileWater = b.halfWidth >= 2 && gap <= -1 ? Water.Deep : Water.Shallow;
          level = Math.min(level, Math.round(bed));
        } else if (gap <= BANK_WIDTH) level = Math.min(level, bankLevel(bed, gap));
      }

      const nearWater =
        tileWater === Water.None &&
        channels.some(({ a, b }) => projectOntoSegment(center, a, b).distance - b.halfWidth <= 1.5);

      const wayDistance = (way: WaySegment) => projectOntoSegment(center, way.a, way.b).distance;
      const fadeRoll = unit(hash(seed, FADE_SALT, x, y));
      const isFaded = (w: WaySegment) => w.fades.some((end) => fadeRoll * FADE_LENGTH > distance(center, end));
      const way = isSea ? undefined : waySegments.find((w) => wayDistance(w) <= w.halfWidth && !isFaded(w));
      const nearWay = waySegments.some((w) => wayDistance(w) <= w.halfWidth + w.clearance);

      const draft: TileDraft = {
        height: level,
        ground: tileGround,
        water: tileWater,
        prop: way && tileWater !== Water.None ? Prop.Bridge : Prop.None,
        way: way?.kind ?? Way.None,
        cover: Cover.None,
        biome: tileBiome,
        forestness: conditions.forestness,
      };
      const claimed = paintInOrder(features, draft, x, y);
      if (!claimed && !way && draft.water === Water.None && !nearWater && !nearWay) {
        const roll = unit(hash(seed, VEGETATION_SALT, x, y));
        if (roll < traits.treeDensity(fields.groves(x, y))) draft.prop = traits.tree(temperature);
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

  return { layer: SURFACE, cx, cy, height, ground, water, prop, biome, way: ways, cover: covers };
};
