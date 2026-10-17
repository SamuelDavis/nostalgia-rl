import { floorDiv } from "../lib";
import {
  type Biome,
  CHUNK_SIZE,
  type Cover,
  type Prop,
  type Ground,
  type Water,
  type Way,
  type Worldgen,
  generateChunk,
  tileIndex,
} from "../worldgen";
import { type ChunkAt, createChunkStore } from "./chunk-store";

export interface Tile {
  readonly height: number;
  readonly ground: Ground;
  readonly water: Water;
  readonly prop: Prop;
  readonly biome: Biome;
  readonly way: Way;
  readonly cover: Cover;
}

export type Terrain = (x: number, y: number) => Tile;

export const createTerrain =
  (chunkAt: ChunkAt): Terrain =>
  (x, y) => {
    const chunk = chunkAt(floorDiv(x, CHUNK_SIZE), floorDiv(y, CHUNK_SIZE));
    const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
    return {
      height: chunk.height[i]!,
      ground: chunk.ground[i] as Ground,
      water: chunk.water[i] as Water,
      prop: chunk.prop[i] as Prop,
      biome: chunk.biome[i] as Biome,
      way: chunk.way[i] as Way,
      cover: chunk.cover[i] as Cover,
    };
  };

export const generatedTerrain = (world: Worldgen): Terrain =>
  createTerrain(
    createChunkStore(
      (cx, cy) => generateChunk(world, cx, cy),
      () => {},
    ).chunkAt,
  );
