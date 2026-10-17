import { Feature, Water, Way } from "./terrain";
import { distance, floorDiv, hash, memoize } from "../lib";
import { describe, expect, it } from "vitest";
import { type Chunk, generateChunk, tileIndex } from "./chunk";
import { CHUNK_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import { createWorldgen } from "./world";

const cachedChunk = memoize(
  ({ world, cx, cy }: { world: ReturnType<typeof createWorldgen>; cx: number; cy: number }) =>
    generateChunk(world, cx, cy),
  ({ world, cx, cy }) => `${world.seed},${cx},${cy}`,
  64,
);

const tileAt = (world: ReturnType<typeof createWorldgen>, x: number, y: number) => {
  const chunk = cachedChunk({ world, cx: floorDiv(x, CHUNK_SIZE), cy: floorDiv(y, CHUNK_SIZE) });
  const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
  return { chunk, i };
};

const digest = (chunk: Chunk) =>
  [chunk.height, chunk.ground, chunk.water, chunk.feature, chunk.biome].reduce(
    (h, layer) => layer.reduce((acc, v) => hash(acc, v), h),
    0,
  );

const heightAt = (world: ReturnType<typeof createWorldgen>, x: number, y: number) => {
  const { chunk, i } = tileAt(world, x, y);
  return { height: chunk.height[i]!, water: chunk.water[i]! };
};

const NEIGHBOURS = [
  [1, 0],
  [0, 1],
] as const;

const steepestStep = (levelAt: (x: number, y: number) => number, x: number, y: number) =>
  Math.max(...NEIGHBOURS.map(([dx, dy]) => Math.abs(levelAt(x + dx, y + dy) - levelAt(x, y))));

const expectNoCarvedCliff = (world: ReturnType<typeof createWorldgen>, x: number, y: number) => {
  const carved = steepestStep((x, y) => heightAt(world, x, y).height, x, y);
  const natural = steepestStep((x, y) => heightLevel(world.fields.elevation(x + 0.5, y + 0.5)), x, y);
  expect(carved).toBeLessThanOrEqual(Math.max(MAX_CLIMB, natural));
};

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
          517722342,
          3467417234,
          2896958364,
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
    const rivers =
      Array.from({ length: 49 }, (_, i) => world.riversNear((i % 7) - 3, Math.floor(i / 7) - 3)).find(
        (found) => found.length > 0,
      ) ?? [];
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
        else expect(chunk.way[i]).toBe(Way.Road);
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

  it("settles camps without carving cliffs", () => {
    for (const seed of [1, 2, 3]) {
      const world = createWorldgen(seed);
      const { spawn } = world;
      for (let y = spawn.y - 14; y <= spawn.y + 14; y++)
        for (let x = spawn.x - 14; x <= spawn.x + 14; x++)
          if (distance({ x, y }, spawn) <= 13) expectNoCarvedCliff(world, x, y);
    }
  });

  it("carves rivers without cliffs", () => {
    for (const seed of [1, 2, 3]) {
      const world = createWorldgen(seed);
      const { cx, cy } = world.cellOf(world.spawn);
      for (const river of world.riversNear(cx, cy))
        for (const node of river.nodes.slice(1, -1)) {
          const x = Math.floor(node.x);
          for (let y = Math.floor(node.y) - 6; y <= Math.floor(node.y) + 6; y++) expectNoCarvedCliff(world, x, y);
        }
    }
  });

  it("keeps roads and trails off the sea", () => {
    const world = createWorldgen(1);
    for (const [cx, cy] of [
      [-23, -42],
      [-24, -42],
      [-23, -43],
      [0, 0],
    ] as const) {
      const chunk = generateChunk(world, cx, cy);
      chunk.way.forEach((way, i) => {
        const x = cx * CHUNK_SIZE + (i % CHUNK_SIZE) + 0.5;
        const y = cy * CHUNK_SIZE + Math.floor(i / CHUNK_SIZE) + 0.5;
        if (heightLevel(world.fields.elevation(x, y)) < SEA_LEVEL) expect(way, `way at ${x},${y}`).toBe(Way.None);
      });
    }
  });
});
