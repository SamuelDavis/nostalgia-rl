import {
  type Placed,
  type Stage,
  type Vec2,
  distance,
  grid,
  paintFeatures,
  projectOntoSegment,
  rngOf,
  stage,
} from "procgen";
import { BIOMES, biomeOf } from "./biome";
import type { FloorLayout, FloorMark } from "./caves/floor";
import { CHUNK_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import type { TileDraft } from "./features/feature";
import type { Fields } from "./fields";
import { type CaveFloor, type Layer, SURFACE } from "./layer";
import type { River, RiverNode } from "./rivers";
import { Biome, Cover, Ground, Prop, Water, Way } from "./terrain";
import { WAY_SHAPES, type WayLink } from "./ways";

export interface Chunk {
  readonly layer: Layer;
  readonly cx: number;
  readonly cy: number;
  readonly height: Int16Array;
  readonly ground: Uint8Array;
  readonly water: Uint8Array;
  readonly prop: Uint8Array;
  readonly part: Uint8Array;
  readonly biome: Uint8Array;
  readonly way: Uint8Array;
  readonly cover: Uint8Array;
}

export const tileIndex = (lx: number, ly: number): number => ly * CHUNK_SIZE + lx;

export const chunks = grid(CHUNK_SIZE);

const TILES = CHUNK_SIZE * CHUNK_SIZE;
const BANK_WIDTH = 12;
const BANK_SLOPE = MAX_CLIMB * 0.75;
export const FADE_LENGTH = 24;
export const CHUNK_RIVER_MARGIN = BANK_WIDTH + 1;
export const CHUNK_WAY_MARGIN = 4;
const CHUNK_CACHE = 256;
const STALAGMITE_SHARE = 0.04;
const MARK_PROPS: Record<FloorMark, Prop> = {
  slope: Prop.Ramp,
  down: Prop.RampDown,
  up: Prop.RampUp,
  exit: Prop.CaveExit,
};
const AROUND: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
];

interface Channel {
  readonly a: RiverNode;
  readonly b: RiverNode;
}

interface WaySegment {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly kind: Way;
  readonly halfWidth: number;
  readonly clearance: number;
  readonly fades: readonly Vec2[];
}

const bankLevel = (bed: number, gap: number): number => Math.floor(bed + gap * BANK_SLOPE);

export const floorChunk = (
  seed: number,
  floor: FloorLayout | undefined,
  layer: CaveFloor,
  cx: number,
  cy: number,
): Chunk => {
  const stalagmites = rngOf(seed, "stalagmites");
  const height = new Int16Array(TILES);
  const prop = new Uint8Array(TILES);
  const ground = new Uint8Array(TILES);
  for (let i = 0; i < TILES; i++) {
    const p = { x: cx * CHUNK_SIZE + (i % CHUNK_SIZE), y: cy * CHUNK_SIZE + Math.floor(i / CHUNK_SIZE) };
    const isInterior = floor?.isChamber(p) && AROUND.every((o) => floor.isChamber({ x: p.x + o.x, y: p.y + o.y }));
    const isStalagmite = isInterior && stalagmites.chance(STALAGMITE_SHARE, p.x, p.y);
    height[i] = floor?.levelAt(p) ?? 0;
    const mark = floor?.markAt(p);
    prop[i] = !floor?.isOpen(p) ? Prop.Rock : mark ? MARK_PROPS[mark] : isStalagmite ? Prop.Stalagmite : Prop.None;
    ground[i] = floor?.isWorked(p) ? Ground.Dressed : Ground.Rock;
  }
  return {
    layer,
    cx,
    cy,
    height,
    ground,
    water: new Uint8Array(TILES).fill(Water.None),
    prop,
    part: new Uint8Array(TILES),
    biome: new Uint8Array(TILES).fill(Biome.Mountain),
    way: new Uint8Array(TILES).fill(Way.None),
    cover: new Uint8Array(TILES).fill(Cover.None),
  };
};

export interface SurfaceInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly features: Stage<readonly Placed<TileDraft>[]>;
  readonly rivers: Stage<readonly River[]>;
  readonly ways: Stage<readonly WayLink[]>;
}

export const createSurface = ({ seed, fields, features, rivers, ways }: SurfaceInput): Stage<Chunk> => {
  const fadeRolls = rngOf(seed, "way fades");
  const vegetation = rngOf(seed, "vegetation");
  const decoration = rngOf(seed, "decoration");

  return stage({
    name: "surface chunks",
    grid: chunks,
    cache: CHUNK_CACHE,
    reads: [
      { stage: features, radius: 0 },
      { stage: rivers, radius: 0 },
      { stage: ways, radius: 0 },
    ],
    compute: (cell, { read }): Chunk => {
      const { col: cx, row: cy } = cell;
      const originX = cx * CHUNK_SIZE;
      const originY = cy * CHUNK_SIZE;
      const near = (p: Vec2, margin: number) =>
        p.x >= originX - margin &&
        p.x <= originX + CHUNK_SIZE + margin &&
        p.y >= originY - margin &&
        p.y <= originY + CHUNK_SIZE + margin;
      const segmentNear = (a: Vec2, b: Vec2, margin: number) =>
        near({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, margin + distance(a, b) / 2);
      const riversHere = read(rivers, cell);
      const channels: Channel[] = riversHere.flatMap((river) =>
        river.nodes.flatMap((a, i) => {
          const b = river.nodes[i + 1];
          return b && segmentNear(a, b, b.halfWidth + CHUNK_RIVER_MARGIN) ? [{ a, b }] : [];
        }),
      );
      const pools = riversHere.flatMap((river) =>
        river.lake && near(river.lake, river.lake.radius + CHUNK_RIVER_MARGIN) ? [river.lake] : [],
      );
      const waySegments: WaySegment[] = read(ways, cell).flatMap(({ nodes, way, fades }) =>
        nodes.flatMap((a, i) => {
          const b = nodes[i + 1];
          return b && segmentNear(a, b, CHUNK_WAY_MARGIN) ? [{ a, b, kind: way, fades, ...WAY_SHAPES[way] }] : [];
        }),
      );
      const placed = read(features, cell);

      const height = new Int16Array(TILES);
      const ground = new Uint8Array(TILES);
      const water = new Uint8Array(TILES);
      const prop = new Uint8Array(TILES);
      const part = new Uint8Array(TILES);
      const biome = new Uint8Array(TILES);
      const wayLayer = new Uint8Array(TILES);
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
          const tileGround = traits.ground(level, temperature + fields.frostEdge(x, y) * 0.035);

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

          const wayDistance = (segment: WaySegment) => projectOntoSegment(center, segment.a, segment.b).distance;
          const fadeRoll = fadeRolls.unit(x, y);
          const isFaded = (w: WaySegment) => w.fades.some((end) => fadeRoll * FADE_LENGTH > distance(center, end));
          const way = isSea ? undefined : waySegments.find((w) => wayDistance(w) <= w.halfWidth && !isFaded(w));
          const nearWay = waySegments.some((w) => wayDistance(w) <= w.halfWidth + w.clearance);

          const draft: TileDraft = {
            height: level,
            ground: tileGround,
            water: tileWater,
            prop: way && tileWater !== Water.None ? Prop.Bridge : Prop.None,
            part: 0,
            way: way?.kind ?? Way.None,
            cover: Cover.None,
            biome: tileBiome,
            forestness: conditions.forestness,
          };
          const claimed = paintFeatures(placed, draft, x, y);
          if (!claimed && !way && draft.water === Water.None && !nearWater && !nearWay) {
            if (vegetation.unit(x, y) < traits.treeDensity(fields.groves(x, y))) draft.prop = traits.tree(temperature);
            else draft.prop = traits.decoration(decoration.unit(x, y));
          }

          height[i] = draft.height;
          ground[i] = draft.water === Water.None ? draft.ground : Ground.Sand;
          water[i] = draft.water;
          prop[i] = draft.prop;
          part[i] = draft.part;
          biome[i] = tileBiome;
          wayLayer[i] = draft.way;
          covers[i] = draft.cover;
        }

      return { layer: SURFACE, cx, cy, height, ground, water, prop, part, biome, way: wayLayer, cover: covers };
    },
  });
};
