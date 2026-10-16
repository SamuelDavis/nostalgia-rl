import { describe, expect, it } from "vitest";
import { type Point, projectOntoSegment } from "../lib";
import { type Trail, createWorldgen } from "../worldgen";
import { blockerBetween, isTrail } from "./movement";
import { type Terrain, createTerrain } from "./terrain";

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const CORRIDOR = 3;

const tileOf = (p: Point): Point => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

const nearTrail = (trail: Trail, p: Point): boolean =>
  trail.nodes.some((a, i) => {
    const b = trail.nodes[i + 1] ?? a;
    return projectOntoSegment({ x: p.x + 0.5, y: p.y + 0.5 }, a, b).distance <= CORRIDOR;
  });

const walksAlong = (terrain: Terrain, trail: Trail): boolean => {
  const start = tileOf(trail.nodes[0]!);
  const goal = tileOf(trail.nodes.at(-1)!);
  const key = (p: Point) => `${p.x},${p.y}`;
  const seen = new Set([key(start)]);
  const frontier = [start];
  while (frontier.length > 0) {
    const p = frontier.pop()!;
    if (p.x === goal.x && p.y === goal.y) return true;
    for (const o of NEIGHBOURS) {
      const n = { x: p.x + o.x, y: p.y + o.y };
      const to = terrain(n.x, n.y);
      if (seen.has(key(n)) || !nearTrail(trail, n) || !isTrail(to) || blockerBetween(terrain(p.x, p.y), to)) continue;
      seen.add(key(n));
      frontier.push(n);
    }
  }
  return false;
};

describe("trails", () => {
  it("are walkable end to end, over ledges by stairs and rivers by bridge", () => {
    const cases = [
      { seed: 1, cell: { cx: 0, cy: 0 } },
      { seed: 1, cell: { cx: 5, cy: 5 } },
      { seed: 3, cell: { cx: 0, cy: 0 } },
    ];
    for (const { seed, cell } of cases) {
      const world = createWorldgen(seed);
      const terrain = createTerrain(world);
      const trails = world.trailsNear(cell.cx, cell.cy);
      expect(trails.length).toBeGreaterThan(0);
      for (const trail of trails) {
        const { x, y } = tileOf(trail.nodes[0]!);
        expect(walksAlong(terrain, trail), `seed ${seed}, trail from ${x},${y}`).toBe(true);
      }
    }
  }, 30_000);
});
