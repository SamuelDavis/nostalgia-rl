import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, type Chunk, type Layer, SURFACE, layerKey } from "../worldgen";
import { chunksAround, createChunkStore } from "./chunk-store";

const chunkOf = (cx: number, cy: number, layer: Layer = SURFACE) => ({ layer, cx, cy }) as Chunk;
const FLOOR = { cave: 1, floor: -2 };

const storeWith = () => {
  const generated: string[] = [];
  const requested: string[] = [];
  const store = createChunkStore(
    (layer, cx, cy) => {
      generated.push(`${layerKey(layer)} ${cx},${cy}`);
      return chunkOf(cx, cy, layer);
    },
    (layer, cx, cy) => requested.push(`${layerKey(layer)} ${cx},${cy}`),
  );
  return { store, generated, requested };
};

describe("chunksAround", () => {
  it("lists the chunks within reach, nearest first", () => {
    const chunks = chunksAround({ x: 16, y: 16 }, CHUNK_SIZE);
    expect(chunks[0]).toEqual({ cx: 0, cy: 0 });
    expect(chunks).toHaveLength(5);
    expect(chunks).toContainEqual({ cx: -1, cy: 0 });
    expect(chunks).not.toContainEqual({ cx: 1, cy: 1 });
  });
});

describe("createChunkStore", () => {
  it("requests each chunk around a point once", () => {
    const { store, requested } = storeWith();
    store.prefetch(SURFACE, { x: 16, y: 16 }, CHUNK_SIZE);
    store.prefetch(SURFACE, { x: 16, y: 16 }, CHUNK_SIZE);
    expect(requested).toEqual(["surface 0,0", "surface 0,-1", "surface -1,0", "surface 1,0", "surface 0,1"]);
  });

  it("serves received chunks on their layer without generating them", () => {
    const { store, generated } = storeWith();
    store.receive(chunkOf(2, 3, FLOOR));
    expect(store.chunkAt(FLOOR, 2, 3)).toEqual(chunkOf(2, 3, FLOOR));
    expect(store.chunkAt(SURFACE, 2, 3)).toEqual(chunkOf(2, 3));
    expect(generated).toEqual(["surface 2,3"]);
  });

  it("generates a missing chunk once and does not request it again", () => {
    const { store, generated, requested } = storeWith();
    store.chunkAt(FLOOR, 0, 0);
    store.chunkAt(FLOOR, 0, 0);
    store.prefetch(FLOOR, { x: 16, y: 16 }, 0);
    expect(generated).toEqual(["1:-2 0,0"]);
    expect(requested).toEqual([]);
  });
});
