import { type Vec2, createLru, distance, floorDiv } from "procgen";
import { CHUNK_SIZE, type Chunk, type Layer, layerKey } from "../worldgen";

export type ChunkAt = (cx: number, cy: number) => Chunk;
type LayerChunkAt = (layer: Layer, cx: number, cy: number) => Chunk;

interface ChunkCoord {
  readonly cx: number;
  readonly cy: number;
}

const CHUNK_CACHE = 1024;

const keyOf = (layer: Layer, cx: number, cy: number) => `${layerKey(layer)} ${cx},${cy}`;
const centreOf = ({ cx, cy }: ChunkCoord): Vec2 => ({ x: (cx + 0.5) * CHUNK_SIZE, y: (cy + 0.5) * CHUNK_SIZE });

export const chunksAround = (p: Vec2, reach: number): ChunkCoord[] => {
  const ring = Math.ceil(reach / CHUNK_SIZE);
  const side = 2 * ring + 1;
  const [ox, oy] = [floorDiv(p.x, CHUNK_SIZE) - ring, floorDiv(p.y, CHUNK_SIZE) - ring];
  const here = centreOf({ cx: ox + ring, cy: oy + ring });
  return Array.from({ length: side * side }, (_, i) => ({ cx: ox + (i % side), cy: oy + Math.floor(i / side) }))
    .map((c) => ({ c, gap: distance(centreOf(c), here) }))
    .filter(({ gap }) => gap <= reach)
    .sort((a, b) => a.gap - b.gap)
    .map(({ c }) => c);
};

export const createChunkStore = (generate: LayerChunkAt, request: (layer: Layer, cx: number, cy: number) => void) => {
  const held = createLru<Chunk>(CHUNK_CACHE);
  const asked = new Set<string>();
  const receive = (chunk: Chunk) => {
    asked.delete(keyOf(chunk.layer, chunk.cx, chunk.cy));
    held.set(keyOf(chunk.layer, chunk.cx, chunk.cy), chunk);
  };
  return {
    receive,
    peek: (layer: Layer, cx: number, cy: number): Chunk | undefined => held.get(keyOf(layer, cx, cy)),
    chunkAt: (layer: Layer, cx: number, cy: number): Chunk => {
      const chunk = held.get(keyOf(layer, cx, cy));
      if (chunk) return chunk;
      const generated = generate(layer, cx, cy);
      receive(generated);
      return generated;
    },
    prefetch: (layer: Layer, p: Vec2, reach: number) => {
      for (const { cx, cy } of chunksAround(p, reach)) {
        const key = keyOf(layer, cx, cy);
        if (held.has(key) || asked.has(key)) continue;
        asked.add(key);
        request(layer, cx, cy);
      }
    },
  };
};
