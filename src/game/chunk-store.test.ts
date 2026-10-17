import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, type Chunk } from "../worldgen";
import { chunksAround, createChunkStore } from "./chunk-store";

const chunkOf = (cx: number, cy: number) => ({ cx, cy }) as Chunk;

const storeWith = () => {
  const generated: string[] = [];
  const requested: string[] = [];
  const store = createChunkStore(
    (cx, cy) => {
      generated.push(`${cx},${cy}`);
      return chunkOf(cx, cy);
    },
    (cx, cy) => requested.push(`${cx},${cy}`),
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
    store.prefetch({ x: 16, y: 16 }, CHUNK_SIZE);
    store.prefetch({ x: 16, y: 16 }, CHUNK_SIZE);
    expect(requested).toEqual(["0,0", "0,-1", "-1,0", "1,0", "0,1"]);
  });

  it("serves received chunks without generating them", () => {
    const { store, generated } = storeWith();
    store.receive(chunkOf(2, 3));
    expect(store.chunkAt(2, 3)).toEqual(chunkOf(2, 3));
    expect(generated).toEqual([]);
  });

  it("generates a missing chunk once and does not request it again", () => {
    const { store, generated, requested } = storeWith();
    store.chunkAt(0, 0);
    store.chunkAt(0, 0);
    store.prefetch({ x: 16, y: 16 }, 0);
    expect(generated).toEqual(["0,0"]);
    expect(requested).toEqual([]);
  });
});
