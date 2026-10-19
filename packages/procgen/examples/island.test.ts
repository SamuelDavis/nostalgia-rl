import { describe, expect, it } from "vitest";
import { createWorld, digest, indexOf, reachOf } from "../src";
import { Prop, createIsland } from "./island";

const island = createIsland(11);
const block = island.chunks.cellsAround({ col: 0, row: 0 }, 2);

describe("island example", () => {
  it("generates chunks that peers agree on, whatever order they generate them in", () => {
    const digests = (cells: typeof block) => {
      const world = createWorld(11);
      return new Map(cells.map((cell) => [`${cell.col},${cell.row}`, digest(world.read(island.chunkAt, cell))]));
    };
    expect(digests([...block].reverse())).toEqual(digests(block));
  });

  it("joins chunks without seams: stitched chunks equal one raster over the same area", () => {
    const world = createWorld(11);
    const area = { minX: -64, minY: -64, maxX: 95, maxY: 95 };
    const placed = [...new Set(block.flatMap((cell) => world.read(island.townsNear, cell)))];
    const links = [...new Set(block.flatMap((cell) => world.read(island.roadsNear, cell)))];
    const whole = island.paintArea(area, placed, links);
    for (const cell of block) {
      const chunk = world.read(island.chunkAt, cell);
      const { minX, minY, maxX, maxY } = island.chunks.boundsOf(cell);
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++)
          for (const name of Object.keys(chunk.columns) as (keyof typeof chunk.columns)[])
            expect(chunk.columns[name][indexOf(chunk, x, y)], `${name} at ${x},${y}`).toBe(
              whole.columns[name][indexOf(whole, x, y)],
            );
    }
  });

  it("builds towns joined by roads, with whole huts", () => {
    const world = createWorld(11);
    const cells = island.chunks.cellsAround({ col: 0, row: 0 }, 12);
    const towns = new Set(cells.flatMap((cell) => world.read(island.townsNear, cell)));
    const roads = new Set(cells.flatMap((cell) => world.read(island.roadsNear, cell)));
    expect(towns.size).toBeGreaterThan(2);
    expect(roads.size).toBeGreaterThan(0);
    const huts = cells.flatMap((cell) => {
      const chunk = world.read(island.chunkAt, cell);
      return [...chunk.columns.prop.keys()]
        .filter((i) => chunk.columns.prop[i] === Prop.Hut)
        .map((i) => chunk.columns.part[i]!);
    });
    expect(huts.filter((part) => part === 0).length * 6).toBe(huts.length);
  });

  it("declares how far a chunk reads", () => {
    expect(reachOf(island.chunkAt)).toBeGreaterThan(0);
    expect(reachOf(island.chunkAt)).toBeLessThan(2000);
  });
});
