import { distance, memoize } from "../lib";
import { describe, expect, it } from "vitest";
import { SEA_LEVEL, heightLevel } from "./constants";
import { regionOf, regionsAround } from "./region";
import { Way } from "./terrain";
import { createWorldgen } from "./world";

const worldOf = memoize(createWorldgen, String, 8);

const seeds = [1, 2, 3, 4, 5];
const ORIGIN = { rx: 0, ry: 0 };
const regions = regionsAround(ORIGIN, 2);

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
      expect(world.campAt(regionOf(world.spawn))).toMatchObject(world.spawn);
    }
  });

  it("links the world spawn by road", () => {
    for (const seed of seeds) {
      const world = worldOf(seed);
      const roads = world
        .waysNear(regionOf(world.spawn))
        .filter(
          (link) =>
            link.way === Way.Road &&
            [link.nodes[0], link.nodes.at(-1)].some((end) => distance(end!, world.spawn) === 0),
        );
      expect(roads.length).toBeGreaterThan(0);
    }
  });

  it("lays ways over land", { tags: "slow" }, () => {
    for (const seed of seeds) {
      const world = worldOf(seed);
      const links = regions.flatMap(world.waysNear);
      expect(links.length).toBeGreaterThan(0);
      for (const link of links)
        for (const node of link.nodes)
          expect(heightLevel(world.fields.elevation(node.x, node.y))).toBeGreaterThanOrEqual(SEA_LEVEL);
    }
  });

  it("is deterministic", () => {
    const a = createWorldgen(9);
    const b = createWorldgen(9);
    expect(a.spawn).toEqual(b.spawn);
    expect(a.campAt({ rx: 1, ry: 1 })).toEqual(b.campAt({ rx: 1, ry: 1 }));
    expect(a.waysNear(ORIGIN)).toEqual(b.waysNear(ORIGIN));
  });
});
