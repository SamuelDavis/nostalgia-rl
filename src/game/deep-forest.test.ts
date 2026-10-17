import { describe, expect, it } from "vitest";
import { type Point, distance } from "../lib";
import { Cover, type DeepForestLayout, Water, Way, createWorldgen, regionOf, regionsAround } from "../worldgen";
import { blockerBetween } from "./movement";
import { createTerrain } from "./terrain";

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const world = createWorldgen(1);
const terrain = createTerrain(world);
const forests = regionsAround({ rx: 0, ry: 0 }, 6).flatMap(world.deepForestsIn);

const key = (p: Point) => `${p.x},${p.y}`;
const centre = (p: Point) => ({ x: p.x + 0.5, y: p.y + 0.5 });
const tileOf = (p: Point): Point => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

const regionDistance = (a: { anchor: Point }, b: { anchor: Point }) => {
  const [ra, rb] = [regionOf(a.anchor), regionOf(b.anchor)];
  return Math.abs(ra.rx - rb.rx) + Math.abs(ra.ry - rb.ry);
};

const reachable = (start: Point, layouts: readonly DeepForestLayout[]): Set<string> => {
  const reached = new Set([key(start)]);
  const frontier = [start];
  while (frontier.length > 0) {
    const p = frontier.pop()!;
    for (const o of NEIGHBOURS) {
      const n = { x: p.x + o.x, y: p.y + o.y };
      if (reached.has(key(n)) || !layouts.some((l) => l.contains(centre(n)) || l.paths.has(key(n)))) continue;
      if (blockerBetween(terrain(p.x, p.y), terrain(n.x, n.y))) continue;
      reached.add(key(n));
      frontier.push(n);
    }
  }
  return reached;
};

describe("deep forests", () => {
  it("grow where forest is deepest", () => {
    expect(forests.length).toBeGreaterThan(2);
  });

  it("join neighbouring parts of one forest by a walkable path", () => {
    const joined = forests.flatMap((a) =>
      forests
        .filter((b) => b.anchor.x > a.anchor.x && a.layout.links.length > 0 && regionDistance(a, b) === 1)
        .map((b) => [a, b] as const)
        .filter(([a, b]) => a.layout.links.some((link) => b.layout.contains(link.there))),
    );
    expect(joined.length).toBeGreaterThan(0);
    for (const [a, b] of joined.slice(0, 3)) {
      const reached = reachable(tileOf(a.layout.glade), [a.layout, b.layout]);
      expect(reached.has(key(tileOf(b.layout.glade))), `from ${key(a.anchor)} to ${key(b.anchor)}`).toBe(true);
    }
  });

  it("connect every opening, link and landmark inside to the glade by walkable tiles inside the forest", () => {
    for (const { layout } of forests.slice(0, 4)) {
      expect(layout.openings.length).toBeGreaterThanOrEqual(2);
      const reached = reachable(tileOf(layout.glade), [layout]);
      for (const p of [...layout.openings.map((o) => o.inside), ...layout.links.map((l) => l.here), ...layout.stops])
        expect(reached.has(key(tileOf(p))), `from ${key(tileOf(p))}`).toBe(true);
    }
  });

  it("are too dense to cross off their paths", () => {
    for (const { layout, bounds } of forests.slice(0, 4)) {
      let open = 0;
      let blocked = 0;
      for (let y = bounds.minY; y <= bounds.maxY; y += 3)
        for (let x = bounds.minX; x <= bounds.maxX; x += 3) {
          if (!layout.contains(centre({ x, y })) || distance(centre({ x, y }), layout.glade) <= layout.glade.radius)
            continue;
          const tile = terrain(x, y);
          if (tile.way !== Way.None) continue;
          if (blockerBetween(tile, tile) === "obstacle") blocked++;
          else open++;
        }
      expect(blocked / (open + blocked)).toBeGreaterThan(0.6);
    }
  });

  it("hide under a canopy except at their openings", () => {
    for (const { layout } of forests.slice(0, 4)) {
      expect(terrain(Math.floor(layout.glade.x), Math.floor(layout.glade.y)).cover).toBe(Cover.Canopy);
      for (const opening of layout.openings) {
        const { x, y } = tileOf(opening.inside);
        expect(terrain(x, y).cover, `opening at ${x},${y}`).toBe(Cover.None);
      }
    }
  });

  it("can only be entered along their paths and rivers", () => {
    for (const { bounds } of forests.slice(0, 4))
      for (let y = bounds.minY; y <= bounds.maxY; y++)
        for (let x = bounds.minX; x <= bounds.maxX; x++) {
          const tile = terrain(x, y);
          if (tile.cover === Cover.None || tile.way !== Way.None || tile.water !== Water.None) continue;
          for (const o of NEIGHBOURS) {
            const outside = terrain(x + o.x, y + o.y);
            if (outside.cover !== Cover.None) continue;
            expect(blockerBetween(outside, tile), `entering ${x},${y}`).toBeDefined();
          }
        }
  });
});
