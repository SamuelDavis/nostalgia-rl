import { Biome, Feature, Ground, Water } from "./terrain";
import { type Point, createNoise, distance, floorDiv, hash, hashString, projectOntoSegment, unit } from "../lib";
import { classifyBiome } from "./biome";
import { CHUNK_SIZE, MACRO_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import type { RiverNode } from "./rivers";
import type { Camp, Worldgen } from "./world";

export interface Chunk {
  readonly cx: number;
  readonly cy: number;
  readonly height: Uint8Array;
  readonly ground: Uint8Array;
  readonly water: Uint8Array;
  readonly feature: Uint8Array;
  readonly biome: Uint8Array;
}

export const tileIndex = (lx: number, ly: number): number => ly * CHUNK_SIZE + lx;

const TILES = CHUNK_SIZE * CHUNK_SIZE;
const BANK_WIDTH = 12;
const ROAD_HALF_WIDTH = 1.1;
const CAMP_RADIUS = 12;
const CAMP_YARD = 5;
const SNOW_LEVEL = heightLevel(0.8125);
const TENT_OFFSETS: readonly Point[] = [
  { x: -4, y: -2 },
  { x: 3, y: -3 },
  { x: 2, y: 4 },
];
const VEGETATION_SALT = hashString("vegetation");
const DECORATION_SALT = hashString("decoration");
const GROVE_SALT = hashString("groves");
const GROUND_SALT = hashString("ground");
const COLD = 0.3;

interface Channel {
  readonly a: RiverNode;
  readonly b: RiverNode;
}

interface Pool extends Point {
  readonly radius: number;
  readonly level: number;
}

const groundFor = (biome: Biome, height: number, temperature: number): Ground => {
  switch (biome) {
    case Biome.Ocean:
    case Biome.Beach:
    case Biome.Desert:
      return Ground.Sand;
    case Biome.Mountain:
      return height >= SNOW_LEVEL || temperature < COLD ? Ground.Snow : Ground.Rock;
    default:
      return temperature < COLD - 0.08 ? Ground.Snow : Ground.Grass;
  }
};

const treeDensity = (biome: Biome, grove: number): number => {
  switch (biome) {
    case Biome.Forest:
      return grove < -0.35 ? 0.02 : 0.45;
    case Biome.Grassland:
      return grove > 0.45 ? 0.3 : 0.012;
    case Biome.Mountain:
      return 0.04;
    case Biome.Desert:
      return 0.008;
    default:
      return 0;
  }
};

const treeFor = (biome: Biome, temperature: number): Feature =>
  biome === Biome.Desert ? Feature.Cactus : biome === Biome.Mountain || temperature < 0.4 ? Feature.Pine : Feature.Oak;

const decorationFor = (biome: Biome, roll: number): Feature => {
  if (biome === Biome.Mountain || biome === Biome.Desert) return roll < 0.03 ? Feature.Boulder : Feature.None;
  if (biome !== Biome.Grassland && biome !== Biome.Forest) return Feature.None;
  if (roll < 0.015) return Feature.Bush;
  if (roll < 0.04) return Feature.Flowers;
  if (roll < 0.12) return Feature.Tuft;
  return Feature.None;
};

const bankRise = (gap: number): number => Math.ceil(gap) * MAX_CLIMB;

const settleTowardCamp = (level: number, campLevel: number, gap: number): number => {
  const slack = Math.ceil(Math.max(0, gap - CAMP_YARD)) * MAX_CLIMB;
  return Math.min(campLevel + slack, Math.max(campLevel - slack, level));
};

const nearbyCamps = (world: Worldgen, cx: number, cy: number): Camp[] => {
  const cell = world.cellOf({ x: cx * CHUNK_SIZE, y: cy * CHUNK_SIZE });
  return [-1, 0, 1].flatMap((dy) => [-1, 0, 1].flatMap((dx) => world.campAt(cell.cx + dx, cell.cy + dy) ?? []));
};

export const generateChunk = (world: Worldgen, cx: number, cy: number): Chunk => {
  const { seed, fields } = world;
  const originX = cx * CHUNK_SIZE;
  const originY = cy * CHUNK_SIZE;
  const cell = {
    cx: floorDiv(originX, MACRO_SIZE),
    cy: floorDiv(originY, MACRO_SIZE),
  };
  const reach = 8;
  const near = (p: Point, margin: number) =>
    p.x >= originX - margin &&
    p.x <= originX + CHUNK_SIZE + margin &&
    p.y >= originY - margin &&
    p.y <= originY + CHUNK_SIZE + margin;
  const segmentNear = (a: Point, b: Point, margin: number) =>
    near({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, margin + distance(a, b) / 2);

  const rivers = world.riversNear(cell.cx, cell.cy);
  const channels: Channel[] = rivers.flatMap((river) =>
    river.nodes.flatMap((a, i) => {
      const b = river.nodes[i + 1];
      return b && segmentNear(a, b, b.halfWidth + BANK_WIDTH + reach) ? [{ a, b }] : [];
    }),
  );
  const pools: Pool[] = rivers.flatMap((river) =>
    river.lake && near(river.lake, river.lake.radius + BANK_WIDTH) ? [river.lake] : [],
  );
  const roadSegments = world.roadsNear(cell.cx, cell.cy).flatMap((road) =>
    road.nodes.flatMap((a, i) => {
      const b = road.nodes[i + 1];
      return b && segmentNear(a, b, reach) ? [{ a, b }] : [];
    }),
  );
  const camps = nearbyCamps(world, cx, cy).filter((camp) => near(camp, CAMP_RADIUS));
  const groves = createNoise(seed, GROVE_SALT);
  const frostEdge = createNoise(seed, GROUND_SALT);

  const height = new Uint8Array(TILES);
  const ground = new Uint8Array(TILES);
  const water = new Uint8Array(TILES);
  const feature = new Uint8Array(TILES);
  const biome = new Uint8Array(TILES);

  for (let ly = 0; ly < CHUNK_SIZE; ly++)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const i = tileIndex(lx, ly);
      const x = originX + lx;
      const y = originY + ly;
      const center = { x: x + 0.5, y: y + 0.5 };
      const elevation = fields.elevation(center.x, center.y);
      const temperature = fields.temperature(center.x, center.y);
      const tileBiome = classifyBiome(elevation, temperature, fields.moisture(center.x, center.y));
      let level = heightLevel(elevation);
      let tileWater: Water = Water.None;
      let tileGround = groundFor(tileBiome, level, temperature + frostEdge(x / 7, y / 7) * 0.035);
      let tileFeature: Feature = Feature.None;

      if (level < SEA_LEVEL) {
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

      const onRoad = roadSegments.some(({ a, b }) => projectOntoSegment(center, a, b).distance <= ROAD_HALF_WIDTH);
      const nearRoad =
        onRoad || roadSegments.some(({ a, b }) => projectOntoSegment(center, a, b).distance <= ROAD_HALF_WIDTH + 1.5);

      const camp = camps.find((c) => distance(center, { x: c.x + 0.5, y: c.y + 0.5 }) <= CAMP_RADIUS);
      if (camp) {
        const gap = distance(center, { x: camp.x + 0.5, y: camp.y + 0.5 });
        level = settleTowardCamp(level, heightLevel(fields.elevation(camp.x + 0.5, camp.y + 0.5)), gap);
        tileWater = Water.None;
        if (onRoad) tileGround = Ground.Road;
        else if (gap <= CAMP_YARD) tileGround = Ground.Dirt;
        if (x === camp.x && y === camp.y) tileFeature = Feature.Campfire;
        else if (TENT_OFFSETS.some((o) => x === camp.x + o.x && y === camp.y + o.y)) tileFeature = Feature.Tent;
      } else if (onRoad) {
        if (tileWater === Water.None) tileGround = Ground.Road;
        else tileFeature = Feature.Bridge;
      } else if (tileWater === Water.None && !nearWater && !nearRoad) {
        const roll = unit(hash(seed, VEGETATION_SALT, x, y));
        if (roll < treeDensity(tileBiome, groves(x / 40, y / 40))) tileFeature = treeFor(tileBiome, temperature);
        else tileFeature = decorationFor(tileBiome, unit(hash(seed, DECORATION_SALT, x, y)));
      }

      height[i] = level;
      ground[i] = tileWater === Water.None ? tileGround : Ground.Sand;
      water[i] = tileWater;
      feature[i] = tileFeature;
      biome[i] = tileBiome;
    }

  return { cx, cy, height, ground, water, feature, biome };
};
