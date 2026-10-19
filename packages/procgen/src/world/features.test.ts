import { describe, expect, it } from "vitest";
import { boundsOf, distance } from "../core/geometry";
import { grid } from "./grid";
import { type FeatureType, featuresNear, paintFeatures } from "./features";
import { scatter } from "./scatter";
import { createWorld, stage } from "./stage";

interface Draft {
  ground: string;
}

const sites = grid(64);
const chunks = grid(16);

const clearingSites = stage({
  name: "clearing sites",
  grid: sites,
  compute: (cell, { rng }) => scatter({ grid: sites, rng, margin: 8 })(cell),
});

interface Clearing {
  readonly centre: { x: number; y: number };
  readonly radius: number;
}

const clearing: FeatureType<{ x: number; y: number }, Clearing, Draft> = {
  name: "clearing",
  priority: 0,
  sites: clearingSites,
  reach: 8,
  build: (centre, { rng }) => ({ centre, radius: rng.int(3, 8, centre.x, centre.y) }),
  bounds: ({ centre, radius }) => boundsOf([centre], radius),
  paint: ({ centre, radius }, draft, x, y) => {
    if (distance({ x, y }, centre) > radius) return false;
    draft.ground = "dirt";
    return true;
  },
};

const hut: FeatureType<{ x: number; y: number }, null, Draft> = {
  name: "hut",
  priority: 1,
  sites: clearingSites,
  reach: 1,
  build: () => null,
  bounds: (_, anchor) => boundsOf([anchor], 1),
  paint: (_, draft) => {
    draft.ground = "floor";
    return true;
  },
};

describe("features", () => {
  const near = featuresNear<Draft>("features near chunks", chunks, [hut, clearing]);

  it("paint in priority order, so higher priorities win", () => {
    const world = createWorld(3);
    const [chunk] = chunks
      .cellsAround({ col: 0, row: 0 }, 8)
      .filter((cell) => world.read(near, cell).some((placed) => placed.type === "hut"));
    const placed = world.read(near, chunk!);
    expect(placed.map(({ priority }) => priority)).toEqual([...placed.map(({ priority }) => priority)].sort());
    const { anchor } = placed.find(({ type }) => type === "hut")!;
    const draft = { ground: "grass" };
    expect(paintFeatures(placed, draft, anchor.x, anchor.y)).toBe(true);
    expect(draft.ground).toBe("floor");
  });

  it("agree between peers that generate chunks in different orders", () => {
    const area = chunks.cellsAround({ col: 0, row: 0 }, 8);
    const summary = (world: ReturnType<typeof createWorld>, cells: typeof area) =>
      new Map(
        cells.map((cell) => [
          `${cell.col},${cell.row}`,
          world
            .read(near, cell)
            .map(({ type, anchor, layout }) => [type, anchor.x, anchor.y, (layout as Clearing | null)?.radius]),
        ]),
      );
    const forward = summary(createWorld(5), area);
    const backward = summary(createWorld(5), [...area].reverse());
    expect([...backward.entries()].sort()).toEqual([...forward.entries()].sort());
    expect([...forward.values()].flat().length).toBeGreaterThan(3);
  });

  it("refuse a feature painting beyond its declared reach", () => {
    const sprawl = { ...clearing, name: "sprawl", reach: 2 };
    const world = createWorld(5);
    const sprawlNear = featuresNear<Draft>("sprawl near", chunks, [sprawl]);
    expect(() => chunks.cellsAround({ col: 0, row: 0 }, 8).forEach((cell) => world.read(sprawlNear, cell))).toThrow(
      /beyond its reach/,
    );
  });
});
