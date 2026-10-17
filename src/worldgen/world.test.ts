import { distance, memoize } from "../lib";
import { describe, expect, it } from "vitest";
import { SEA_LEVEL, heightLevel } from "./constants";
import { createWorldgen } from "./world";

const worldOf = memoize(createWorldgen, String, 8);

const seeds = [1, 2, 3, 4, 5];
const regions = Array.from({ length: 25 }, (_, i) => ({
  cx: (i % 5) - 2,
  cy: Math.floor(i / 5) - 2,
}));

describe("createWorldgen", () => {
  it("places a flat, dry world spawn near the origin", () => {
    for (const seed of seeds) {
      const world = worldOf(seed);
      const { elevation } = world.fields;
      expect(distance(world.spawn, { x: 0, y: 0 })).toBeLessThan(1000);
      expect(heightLevel(elevation(world.spawn.x, world.spawn.y))).toBeGreaterThan(SEA_LEVEL);
    }
  });

  it("puts the world spawn camp in its macro region", () => {
    for (const seed of seeds) {
      const world = worldOf(seed);
      const { cx, cy } = world.regionOf(world.spawn);
      expect(world.campAt(cx, cy)).toMatchObject(world.spawn);
    }
  });

  it("links the world spawn by road", () => {
    for (const seed of seeds) {
      const world = worldOf(seed);
      const { cx, cy } = world.regionOf(world.spawn);
      const roads = world.roadsNear(cx, cy).filter((r) => r.from === world.spawn || r.to === world.spawn);
      expect(roads.length).toBeGreaterThan(0);
    }
  });

  it("connects roads between camps over land", () => {
    for (const seed of seeds) {
      const world = worldOf(seed);
      const roads = regions.flatMap(({ cx, cy }) => world.roadsFrom(cx, cy));
      expect(roads.length).toBeGreaterThan(0);
      for (const road of roads) {
        expect(distance(road.nodes[0]!, road.from)).toBeLessThan(4);
        expect(distance(road.nodes.at(-1)!, road.to)).toBeLessThan(4);
        for (const node of road.nodes)
          expect(heightLevel(world.fields.elevation(node.x, node.y))).toBeGreaterThanOrEqual(SEA_LEVEL);
      }
    }
  });

  it("is deterministic", () => {
    const a = createWorldgen(9);
    const b = createWorldgen(9);
    expect(a.spawn).toEqual(b.spawn);
    expect(a.campAt(1, 1)).toEqual(b.campAt(1, 1));
    expect(a.roadsFrom(0, 0)).toEqual(b.roadsFrom(0, 0));
  });
});
