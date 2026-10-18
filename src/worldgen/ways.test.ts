import { describe, expect, it } from "vitest";
import { type Point, distance, memoize } from "../lib";
import { type Bounds, boundsOf, overlaps, regionBounds, regionOf, regionsAround } from "./region";
import { Way } from "./terrain";
import type { WayLink } from "./ways";
import { createWorldgen } from "./world";

const worldOf = memoize(createWorldgen, String, 4);
const ORIGIN = { rx: 0, ry: 0 };
const regions = regionsAround(ORIGIN, 2);

const linkKey = ({ nodes }: WayLink) => `${nodes[0]!.x},${nodes[0]!.y}-${nodes.at(-1)!.x},${nodes.at(-1)!.y}`;
const touches = (link: WayLink, bounds: Bounds) => overlaps(boundsOf(link.nodes, 8), bounds);

describe("way network", () => {
  it("gives neighbouring regions the same links where they meet", () => {
    const world = worldOf(1);
    for (const region of regions)
      for (const other of [
        { rx: region.rx + 1, ry: region.ry },
        { rx: region.rx, ry: region.ry + 1 },
      ]) {
        const shared = (links: readonly WayLink[]) =>
          links
            .filter((link) => touches(link, regionBounds(region)) && touches(link, regionBounds(other)))
            .map(linkKey)
            .sort();
        expect(shared(world.waysNear(other))).toEqual(shared(world.waysNear(region)));
      }
  });

  it("rarely ends in a fade", () => {
    for (const seed of [1, 2, 3]) {
      const links = [...new Set(regions.flatMap(worldOf(seed).waysNear))];
      expect(links.filter((link) => link.fades.length > 0).length / links.length).toBeLessThan(0.25);
    }
  });

  it("joins almost every camp by road", () => {
    for (const seed of [1, 2, 3]) {
      const world = worldOf(seed);
      const camps = regions.flatMap((region) => world.campAt(region) ?? []);
      const isJoined = (camp: Point) =>
        world
          .waysNear(regionOf(camp))
          .some(
            (link) =>
              link.way === Way.Road && [link.nodes[0]!, link.nodes.at(-1)!].some((end) => distance(end, camp) === 0),
          );
      expect(camps.filter(isJoined).length / camps.length).toBeGreaterThan(0.9);
    }
  });

  it("leads a road to every mine entrance, not just to the network's edge", () => {
    for (const seed of [1, 2, 3]) {
      const world = worldOf(seed);
      const entrances = regionsAround(ORIGIN, 4).flatMap(world.mineEntrancesIn);
      const roadsFrom = (p: Point) =>
        world
          .waysNear(regionOf(p))
          .filter((link) => link.way === Way.Road && distance(link.nodes[0]!, p) === 0 && link.fades.length === 0);
      expect(entrances.length).toBeGreaterThan(0);
      expect(
        entrances.filter(({ outside }) => roadsFrom(outside).length > 0).length / entrances.length,
      ).toBeGreaterThan(0.9);
    }
  });
});
