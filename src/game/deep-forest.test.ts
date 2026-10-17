import { describe, expect, it } from "vitest";
import { type Point, distance } from "../lib";
import { Cover, Water, Way, createWorldgen } from "../worldgen";
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
const forests = Array.from({ length: 169 }, (_, i) => world.deepForestAt((i % 13) - 6, Math.floor(i / 13) - 6)).filter(
  (forest) => forest !== undefined,
);

const key = (p: Point) => `${p.x},${p.y}`;
const centre = (p: Point) => ({ x: p.x + 0.5, y: p.y + 0.5 });
const tileOf = (p: Point): Point => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

describe("deep forests", () => {
  it("grow in wet forest", () => {
    expect(forests.length).toBeGreaterThan(2);
  });

  it("never overlap", () => {
    for (const a of forests)
      for (const b of forests)
        if (a !== b) expect(distance(a.anchor, b.anchor)).toBeGreaterThanOrEqual(a.reach + b.reach);
  });

  it("connect every opening to the glade by walkable tiles inside the forest", () => {
    for (const { layout } of forests.slice(0, 4)) {
      expect(layout.openings.length).toBeGreaterThanOrEqual(2);
      const start = tileOf(layout.glade);
      const reached = new Set([key(start)]);
      const frontier = [start];
      while (frontier.length > 0) {
        const p = frontier.pop()!;
        for (const o of NEIGHBOURS) {
          const n = { x: p.x + o.x, y: p.y + o.y };
          if (reached.has(key(n)) || !(layout.contains(centre(n)) || layout.paths.has(key(n)))) continue;
          if (blockerBetween(terrain(p.x, p.y), terrain(n.x, n.y))) continue;
          reached.add(key(n));
          frontier.push(n);
        }
      }
      for (const opening of layout.openings)
        expect(reached.has(key(tileOf(opening.inside))), `opening at ${key(tileOf(opening.inside))}`).toBe(true);
    }
  });

  it("are too dense to cross off their paths", () => {
    for (const { layout, anchor, reach } of forests.slice(0, 4)) {
      let open = 0;
      let blocked = 0;
      for (let y = anchor.y - reach; y <= anchor.y + reach; y += 3)
        for (let x = anchor.x - reach; x <= anchor.x + reach; x += 3) {
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
    for (const { anchor, reach } of forests.slice(0, 4))
      for (let y = anchor.y - reach; y <= anchor.y + reach; y++)
        for (let x = anchor.x - reach; x <= anchor.x + reach; x++) {
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
