import { describe, expect, it } from "vitest";
import { type Vec2, distance, memoize } from "procgen";
import { type Bounds, boundsOf, overlaps } from "procgen";
import { regions } from "./region";
import { Way } from "./terrain";
import type { WayLink } from "./ways";
import { createWorldgen } from "./world";

const worldOf = memoize(createWorldgen, String, 4);
const ORIGIN = { col: 0, row: 0 };
const nearby = regions.cellsAround(ORIGIN, 2);

const linkKey = ({ nodes }: WayLink) => `${nodes[0]!.x},${nodes[0]!.y}-${nodes.at(-1)!.x},${nodes.at(-1)!.y}`;
const touches = (link: WayLink, bounds: Bounds) => overlaps(boundsOf(link.nodes, 8), bounds);

describe("way network", () => {
  it("gives neighbouring regions the same links where they meet", () => {
    const world = worldOf(1);
    for (const region of nearby)
      for (const other of [
        { col: region.col + 1, row: region.row },
        { col: region.col, row: region.row + 1 },
      ]) {
        const shared = (links: readonly WayLink[]) =>
          links
            .filter((link) => touches(link, regions.boundsOf(region)) && touches(link, regions.boundsOf(other)))
            .map(linkKey)
            .sort();
        expect(shared(world.waysNear(other))).toEqual(shared(world.waysNear(region)));
      }
  });

  it("rarely ends in a fade", () => {
    for (const seed of [1, 2, 3]) {
      const links = [...new Set(nearby.flatMap(worldOf(seed).waysNear))];
      expect(links.filter((link) => link.fades.length > 0).length / links.length).toBeLessThan(0.25);
    }
  });

  it("joins almost every camp by road", () => {
    for (const seed of [1, 2, 3]) {
      const world = worldOf(seed);
      const camps = nearby.flatMap((region) => world.campAt(region) ?? []);
      const isJoined = (camp: Vec2) =>
        world
          .waysNear(regions.cellOf(camp))
          .some(
            (link) =>
              link.way === Way.Road && [link.nodes[0]!, link.nodes.at(-1)!].some((end) => distance(end, camp) === 0),
          );
      expect(camps.filter(isJoined).length / camps.length).toBeGreaterThan(0.9);
    }
  });

  it("leads a road to every mine entrance, not just to the network's edge", () => {
    const joined = [1, 2, 3].flatMap((seed) => {
      const world = worldOf(seed);
      const roadsFrom = (p: Vec2) =>
        world
          .waysNear(regions.cellOf(p))
          .filter((link) => link.way === Way.Road && distance(link.nodes[0]!, p) === 0 && link.fades.length === 0);
      return regions
        .cellsAround(ORIGIN, 4)
        .flatMap(world.mineEntrancesIn)
        .map(({ outside }) => roadsFrom(outside).length > 0);
    });
    expect(joined.length).toBeGreaterThan(3);
    expect(joined.filter(Boolean).length / joined.length).toBeGreaterThan(0.9);
  });
});
