import { describe, expect, it } from "vitest";
import { type Vec2, distance, distanceToPolyline } from "../core/geometry";
import { grid } from "./grid";
import { network, routeOnGrid } from "./network";
import { scatter } from "./scatter";
import { createWorld, stage } from "./stage";

const towns = grid(100);
const chunks = grid(32);
const townSites = stage({
  name: "towns",
  grid: towns,
  compute: (cell, { rng }) => scatter({ grid: towns, rng, margin: 10 })(cell),
});

const roads = network<Vec2, "road">({
  name: "roads",
  nodes: townSites,
  reach: 180,
  spread: 0,
  join: (from, to) => ({ edge: "road", path: [from, to] }),
});

describe("network", () => {
  it("joins each pair of nodes at most once, owned by one end", () => {
    const world = createWorld(2);
    const links = towns.cellsAround({ col: 0, row: 0 }, 3).flatMap((cell) => world.read(roads.owned, cell));
    const keys = links.map(({ from, to }) =>
      [from, to]
        .map(({ x, y }) => `${x},${y}`)
        .sort()
        .join("-"),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(links.length).toBeGreaterThan(10);
    for (const { from, to } of links) expect(distance(from, to)).toBeLessThanOrEqual(180);
  });

  it("gives every chunk the links that cross it, whichever order peers ask in", () => {
    const near = roads.near(chunks);
    const area = chunks.cellsAround({ col: 0, row: 0 }, 6);
    const summarise = (cells: typeof area) => {
      const world = createWorld(2);
      return new Map(
        cells.map((cell) => [`${cell.col},${cell.row}`, world.read(near, cell).map(({ from, to }) => [from, to])]),
      );
    };
    const forward = summarise(area);
    expect(summarise([...area].reverse())).toEqual(forward);
    const world = createWorld(2);
    for (const cell of area) {
      const bounds = chunks.boundsOf(cell);
      const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
      for (const link of towns.cellsAround({ col: 0, row: 0 }, 4).flatMap((c) => world.read(roads.owned, c)))
        if (distanceToPolyline(centre, link.path) < 8) expect(world.read(near, cell)).toContainEqual(link);
    }
  });

  it("refuses a link that strays beyond its spread", () => {
    const wild = network<Vec2, null>({
      name: "wild",
      nodes: townSites,
      reach: 180,
      spread: 5,
      join: (from, to) => ({ edge: null, path: [from, { x: from.x, y: from.y - 50 }, to] }),
    });
    expect(() => createWorld(2).read(wild.owned, { col: 0, row: 0 })).toThrow(/beyond its spread/);
  });
});

describe("routeOnGrid", () => {
  it("routes around blocked ground, from end to end", () => {
    const wall = (p: Vec2) => p.x === 20 && p.y > -40;
    const crossesWall = (a: Vec2, b: Vec2) => (a.x - 20) * (b.x - 20) <= 0 && Math.max(a.y, b.y) > -40;
    const path = routeOnGrid({
      from: { x: 0, y: 0 },
      to: { x: 40, y: 1 },
      step: 4,
      margin: 64,
      cost: (a, b) => (crossesWall(a, b) ? Infinity : distance(a, b)),
      heuristicCostPerUnit: 1,
    })!;
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 40, y: 1 });
    expect(path.some(wall)).toBe(false);
    expect(path.some((p) => p.y <= -40)).toBe(true);
  });

  it("gives up when the goal is walled off within its margin", () => {
    const route = routeOnGrid({
      from: { x: 0, y: 0 },
      to: { x: 40, y: 0 },
      step: 4,
      margin: 16,
      cost: (a, b) => ((a.x - 20) * (b.x - 20) <= 0 ? Infinity : distance(a, b)),
      heuristicCostPerUnit: 1,
    });
    expect(route).toBeUndefined();
  });
});
