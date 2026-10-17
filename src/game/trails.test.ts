import { describe, expect, it } from "vitest";
import { type Point, projectOntoSegment, memoize } from "../lib";
import { type Trail, Way, createWorldgen, findPeak, regionsAround } from "../worldgen";
import { blockerBetween } from "./movement";
import { type Terrain, createTerrain } from "./terrain";

const worldOf = memoize(createWorldgen, String, 8);

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const CORRIDOR = 3;
const ORIGIN = { rx: 0, ry: 0 };

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
    if (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) <= 1) return true;
    for (const o of NEIGHBOURS) {
      const n = { x: p.x + o.x, y: p.y + o.y };
      const to = terrain(n.x, n.y);
      const onWay = to.way === Way.Path || nearTrail(trail, n);
      if (seen.has(key(n)) || !onWay || blockerBetween(terrain(p.x, p.y), to)) continue;
      seen.add(key(n));
      frontier.push(n);
    }
  }
  return false;
};

describe("trails", () => {
  it("lead walkers to their far end, over ledges by stairs and rivers by bridge", { tags: "slow" }, () => {
    const regions = regionsAround(ORIGIN, 1);
    const mountainRegion = regionsAround(ORIGIN, 8).find(
      (region) => findPeak(worldOf(1).fields, region) !== undefined,
    )!;
    const cases = [
      ...[1, 2, 3].flatMap((seed) => regions.map((region) => ({ seed, region }))),
      { seed: 1, region: mountainRegion },
    ];
    let walked = 0;
    for (const { seed, region } of cases) {
      const world = worldOf(seed);
      const terrain = createTerrain(world);
      for (const trail of world.trailsNear(region)) {
        const { x, y } = tileOf(trail.nodes[0]!);
        expect(walksAlong(terrain, trail), `seed ${seed}, trail from ${x},${y}`).toBe(true);
        walked++;
      }
    }
    expect(walked).toBeGreaterThan(0);
  });
});
