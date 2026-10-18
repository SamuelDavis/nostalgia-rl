import { type Point, floorDiv, memoize } from "../lib";
import {
  type Biome,
  CHUNK_SIZE,
  type Chunk,
  type Cover,
  type Prop,
  type Ground,
  type Layer,
  type Water,
  type Way,
  type Worldgen,
  chunkOn,
  layerKey,
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

const LAYER_CACHE = 16;

export type Terrain = (x: number, y: number) => Tile;

export interface Layers {
  readonly terrainOn: (layer: Layer) => Terrain;
  readonly linkAcross: (layer: Layer, from: Point, to: Point) => Layer | undefined;
}

export const onlySurface = (terrain: Terrain): Layers => ({
  terrainOn: () => terrain,
  linkAcross: () => undefined,
});

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

export const layersOf = (world: Worldgen, chunkAt: (layer: Layer, cx: number, cy: number) => Chunk): Layers => ({
  terrainOn: memoize((layer: Layer) => createTerrain((cx, cy) => chunkAt(layer, cx, cy)), layerKey, LAYER_CACHE),
  linkAcross: world.linkAcross,
});

export const generatedLayers = (world: Worldgen): Layers =>
  layersOf(
    world,
    createChunkStore(
      (layer, cx, cy) => chunkOn(world, layer, cx, cy),
      () => {},
    ).chunkAt,
  );
