import { floorDiv, memoize } from "../lib";
import {
  type Biome,
  CHUNK_SIZE,
  type Chunk,
  type Feature,
  type Ground,
  type Water,
  type Way,
  type Worldgen,
  generateChunk,
  tileIndex,
} from "../worldgen";

export interface Tile {
  readonly height: number;
  readonly ground: Ground;
  readonly water: Water;
  readonly feature: Feature;
  readonly biome: Biome;
  readonly way: Way;
}

export type Terrain = (x: number, y: number) => Tile;

const CHUNK_CACHE = 1024;

export const createTerrain = (world: Worldgen): Terrain => {
  const chunkAt = memoize(
    ({ cx, cy }: { cx: number; cy: number }): Chunk => generateChunk(world, cx, cy),
    ({ cx, cy }) => `${cx},${cy}`,
    CHUNK_CACHE,
  );
  return (x, y) => {
    const chunk = chunkAt({ cx: floorDiv(x, CHUNK_SIZE), cy: floorDiv(y, CHUNK_SIZE) });
    const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
    return {
      height: chunk.height[i]!,
      ground: chunk.ground[i] as Ground,
      water: chunk.water[i] as Water,
      feature: chunk.feature[i] as Feature,
      biome: chunk.biome[i] as Biome,
      way: chunk.way[i] as Way,
    };
  };
};
