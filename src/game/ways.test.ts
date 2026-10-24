import { describe, expect, it } from "vitest";
import { type Bounds, type Vec2, boundsOf, distance, projectOntoSegment, memoize } from "procgen";
import {
  Cover,
  FADE_LENGTH,
  Way,
  type WayLink,
  type Worldgen,
  createWorldgen,
  findPeak,
  SURFACE,
  regions,
} from "../worldgen";
import { blockerBetween } from "./movement";
import { withRandomSeed } from "./seeds.fixtures";
import { type Terrain, generatedLayers } from "./terrain";

const worldOf = memoize(createWorldgen, String, 8);

const NEIGHBOURS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const WAY_SEEDS = [1, 2, 5, 6, 15];
const CORRIDOR = 3;
const DETOUR = 48;

const isWithin = (p: Vec2, { minX, minY, maxX, maxY }: Bounds) =>
  p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
const ORIGIN = { col: 0, row: 0 };

const tileOf = (p: Vec2): Vec2 => ({ x: Math.floor(p.x), y: Math.floor(p.y) });

const nearLink = (link: WayLink, p: Vec2): boolean =>
  link.nodes.some((a, i) => {
    const b = link.nodes[i + 1] ?? a;
    return projectOntoSegment({ x: p.x + 0.5, y: p.y + 0.5 }, a, b).distance <= CORRIDOR;
  });

const walkEnds = (terrain: Terrain, link: WayLink) =>
  link.nodes.filter((node) => {
    const { x, y } = tileOf(node);
    const tile = terrain(x, y);
    const isRerouted = tile.way === Way.None && tile.cover !== Cover.None;
    return !isRerouted && link.fades.every((end) => distance(node, end) >= FADE_LENGTH);
  });

const gladesOn = (world: Worldgen, link: WayLink): Vec2[] =>
  regions
    .cellsAround(regions.cellOf(link.nodes[0]!), 2)
    .flatMap(world.deepForestsIn)
    .filter(({ layout }) => link.nodes.some((node) => layout.contains(tileOf(node))))
    .map(({ layout }) => layout.glade);

const walksAlong = (world: Worldgen, terrain: Terrain, link: WayLink, from: Vec2, to: Vec2): boolean => {
  const area = boundsOf([...link.nodes, ...gladesOn(world, link)], DETOUR);
  const start = tileOf(from);
  const goal = tileOf(to);
  const key = (p: Vec2) => `${p.x},${p.y}`;
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
    const nearby = regions.cellsAround(ORIGIN, 1);
    const mountainRegion = regions
      .cellsAround(ORIGIN, 8)
      .find((region) => findPeak(worldOf(1).fields, region) !== undefined)!;
    const cases = [
      ...withRandomSeed(WAY_SEEDS).flatMap((seed) => nearby.map((region) => ({ seed, region }))),
      { seed: 1, region: mountainRegion },
    ];
    let walked = 0;
    for (const { seed, region } of cases) {
      const world = worldOf(seed);
      const terrain = generatedLayers(world).terrainOn(SURFACE);
      for (const link of world.waysNear(region)) {
        const ends = walkEnds(terrain, link);
        if (ends.length < 2) continue;
        const { x, y } = tileOf(ends[0]!);
        expect(walksAlong(world, terrain, link, ends[0]!, ends.at(-1)!), `seed ${seed}, way from ${x},${y}`).toBe(true);
        walked++;
      }
    }
    expect(walked).toBeGreaterThan(0);
  });
});
