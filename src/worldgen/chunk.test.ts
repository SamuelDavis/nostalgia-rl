import { Feature, Ground, Water } from "./terrain";
import { distance, floorDiv, hash } from "../lib";
import { describe, expect, it } from "vitest";
import { type Chunk, generateChunk, tileIndex } from "./chunk";
import { CHUNK_SIZE, SEA_LEVEL, heightLevel } from "./constants";
import { createWorldgen } from "./world";

const tileAt = (world: ReturnType<typeof createWorldgen>, x: number, y: number) => {
  const chunk = generateChunk(world, floorDiv(x, CHUNK_SIZE), floorDiv(y, CHUNK_SIZE));
  const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
  return { chunk, i };
};

const digest = (chunk: Chunk) =>
  [chunk.height, chunk.ground, chunk.water, chunk.feature, chunk.biome].reduce(
    (h, layer) => layer.reduce((acc, v) => hash(acc, v), h),
    0,
  );

describe("generateChunk", () => {
  it("is independent of generation order and world instance", () => {
    const a = createWorldgen(1);
    const first = generateChunk(a, 3, -2);
    generateChunk(a, 0, 0);
    const b = createWorldgen(1);
    generateChunk(b, 7, 7);
    expect(generateChunk(b, 3, -2)).toEqual(first);
    expect(generateChunk(a, 3, -2)).toEqual(first);
  });

  it("matches golden digests", () => {
    const world = createWorldgen(1);
    expect([generateChunk(world, 0, 0), generateChunk(world, -5, 9), generateChunk(world, 20, -13)].map(digest))
      .toMatchInlineSnapshot(`
        [
          1300940276,
          53854920,
          2193426854,
        ]
      `);
  });

  it("floods the ocean at a flat surface", () => {
    const world = createWorldgen(2);
    for (let cy = -8; cy < 8; cy += 3)
      for (let cx = -8; cx < 8; cx += 3) {
        const chunk = generateChunk(world, cx * 4, cy * 4);
        chunk.height.forEach((_, i) => {
          const x = chunk.cx * CHUNK_SIZE + (i % CHUNK_SIZE) + 0.5;
          const y = chunk.cy * CHUNK_SIZE + Math.floor(i / CHUNK_SIZE) + 0.5;
          if (heightLevel(world.fields.elevation(x, y)) < SEA_LEVEL) {
            expect(chunk.water[i]).not.toBe(Water.None);
            expect(chunk.height[i]).toBe(SEA_LEVEL - 1);
          }
        });
      }
  });

  it("carves rivers as water", () => {
    const world = createWorldgen(1);
    const rivers = world.riversNear(0, 0);
    expect(rivers.length).toBeGreaterThan(0);
    for (const river of rivers)
      for (const node of river.nodes.slice(0, -1)) {
        const { chunk, i } = tileAt(world, Math.floor(node.x), Math.floor(node.y));
        expect(chunk.water[i]).not.toBe(Water.None);
      }
  });

  it("paves roads and bridges rivers", () => {
    const world = createWorldgen(1);
    const { cx, cy } = world.cellOf(world.spawn);
    const roads = world.roadsNear(cx, cy);
    expect(roads.length).toBeGreaterThan(0);
    for (const road of roads)
      for (const node of road.nodes) {
        if (distance(node, road.from) < 9 || distance(node, road.to) < 9) continue;
        const { chunk, i } = tileAt(world, Math.floor(node.x), Math.floor(node.y));
        const water = chunk.water[i] !== Water.None;
        if (water) expect(chunk.feature[i]).toBe(Feature.Bridge);
        else expect(chunk.ground[i]).toBe(Ground.Road);
      }
  });

  it("lights a campfire at the world spawn", () => {
    const world = createWorldgen(1);
    const { chunk, i } = tileAt(world, world.spawn.x, world.spawn.y);
    expect(chunk.feature[i]).toBe(Feature.Campfire);
  });

  it("grows trees", () => {
    const world = createWorldgen(1);
    const trees = generateChunk(world, 2, 2).feature.filter((f) => f === Feature.Oak || f === Feature.Pine);
    expect(trees.length).toBeGreaterThan(0);
  });
});
