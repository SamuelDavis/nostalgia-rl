import { describe, expect, it } from "vitest";
import { type Point, projectOntoSegment } from "../lib";
import { type Trail, type Worldgen, createWorldgen, findPeak } from "../worldgen";
import { blockerBetween } from "./movement";
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

const deepForestPaths = (world: Worldgen, cx: number, cy: number): ReadonlySet<string>[] =>
  Array.from({ length: 25 }, (_, i) => world.deepForestsIn(cx + (i % 5) - 2, cy + Math.floor(i / 5) - 2)).flatMap(
    (forests) => forests.map((forest) => forest.layout.paths),
  );

const walksAlong = (terrain: Terrain, trail: Trail, forestPaths: readonly ReadonlySet<string>[]): boolean => {
  const start = tileOf(trail.nodes[0]!);
  const goal = tileOf(trail.nodes.at(-1)!);
  const key = (p: Point) => `${p.x},${p.y}`;
  const seen = new Set([key(start)]);
  const frontier = [start];
  while (frontier.length > 0) {
    const p = frontier.pop()!;
    if (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) <= 1) return true;
    for (const o of NEIGHBOURS) {
      const n = { x: p.x + o.x, y: p.y + o.y };
      const to = terrain(n.x, n.y);
      const onWay = nearTrail(trail, n) || forestPaths.some((paths) => paths.has(key(n)));
      if (seen.has(key(n)) || !onWay || blockerBetween(terrain(p.x, p.y), to)) continue;
      seen.add(key(n));
      frontier.push(n);
    }
  }
  return false;
};

describe("trails", () => {
  it("lead walkers to their far end, over ledges by stairs and rivers by bridge", () => {
    const regions = Array.from({ length: 9 }, (_, i) => ({ cx: (i % 3) - 1, cy: Math.floor(i / 3) - 1 }));
    const mountainRegion = Array.from({ length: 289 }, (_, i) => ({
      cx: (i % 17) - 8,
      cy: Math.floor(i / 17) - 8,
    })).find(({ cx, cy }) => findPeak(createWorldgen(1).fields, cx, cy) !== undefined)!;
    const cases = [
      ...[1, 2, 3].flatMap((seed) => regions.map((region) => ({ seed, region }))),
      { seed: 1, region: mountainRegion },
    ];
    let walked = 0;
    for (const { seed, region } of cases) {
      const world = createWorldgen(seed);
      const terrain = createTerrain(world);
      const forestPaths = deepForestPaths(world, region.cx, region.cy);
      for (const trail of world.trailsNear(region.cx, region.cy)) {
        const { x, y } = tileOf(trail.nodes[0]!);
        expect(walksAlong(terrain, trail, forestPaths), `seed ${seed}, trail from ${x},${y}`).toBe(true);
        walked++;
      }
    }
    expect(walked).toBeGreaterThan(0);
  }, 120_000);
});
