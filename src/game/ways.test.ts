import { describe, expect, it } from "vitest";
import { type Point, distance, projectOntoSegment, memoize } from "../lib";
import {
  type Bounds,
  Cover,
  FADE_LENGTH,
  Way,
  type WayLink,
  boundsOf,
  createWorldgen,
  findPeak,
  regionsAround,
} from "../worldgen";
import { blockerBetween } from "./movement";
import { type Terrain, generatedTerrain } from "./terrain";

const worldOf = memoize(createWorldgen, String, 8);

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const CORRIDOR = 3;
const DETOUR = 48;

const isWithin = (p: Point, { minX, minY, maxX, maxY }: Bounds) =>
  p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
const ORIGIN = { rx: 0, ry: 0 };

const tileOf = (p: Point): Point => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

const nearLink = (link: WayLink, p: Point): boolean =>
  link.nodes.some((a, i) => {
    const b = link.nodes[i + 1] ?? a;
    return projectOntoSegment({ x: p.x + 0.5, y: p.y + 0.5 }, a, b).distance <= CORRIDOR;
  });

const unfaded = (link: WayLink) =>
  link.nodes.filter((node) => link.fades.every((end) => distance(node, end) >= FADE_LENGTH));

const walksAlong = (terrain: Terrain, link: WayLink, from: Point, to: Point): boolean => {
  const area = boundsOf(link.nodes, DETOUR);
  const start = tileOf(from);
  const goal = tileOf(to);
  const key = (p: Point) => `${p.x},${p.y}`;
  const seen = new Set([key(start)]);
  const frontier = [start];
  while (frontier.length > 0) {
    const p = frontier.pop()!;
    if (Math.abs(p.x - goal.x) + Math.abs(p.y - goal.y) <= 1) return true;
    for (const o of NEIGHBOURS) {
      const n = { x: p.x + o.x, y: p.y + o.y };
      const to = terrain(n.x, n.y);
      const onWay = (to.way !== Way.None && (to.cover !== Cover.None || isWithin(n, area))) || nearLink(link, n);
      if (seen.has(key(n)) || !onWay || blockerBetween(terrain(p.x, p.y), to)) continue;
      seen.add(key(n));
      frontier.push(n);
    }
  }
  return false;
};

describe("ways", () => {
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
      const terrain = generatedTerrain(world);
      for (const link of world.waysNear(region)) {
        const ends = unfaded(link);
        if (ends.length < 2) continue;
        const { x, y } = tileOf(ends[0]!);
        expect(walksAlong(terrain, link, ends[0]!, ends.at(-1)!), `seed ${seed}, way from ${x},${y}`).toBe(true);
        walked++;
      }
    }
    expect(walked).toBeGreaterThan(0);
  });
});
