import { describe, expect, it } from "vitest";
import { type Point, distance } from "../lib";
import { type Layer, SURFACE, createWorldgen, findPeak, layerKey, regionsAround } from "../worldgen";
import { createWayness } from "../worldgen/ways";
import { type Cave, createCaves } from "../worldgen/caves/caves";
import { TERRITORY_RADIUS } from "../worldgen/caves/siting";
import { blockerBetween } from "./movement";
import { generatedLayers } from "./terrain";

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const SEED = 1;
const world = createWorldgen(SEED);
const caves = createCaves({
  seed: SEED,
  fields: world.fields,
  peakOf: (r) => findPeak(world.fields, r),
  waynessAt: createWayness(world),
  waysNear: world.waysNear,
});
const nearby = regionsAround({ rx: 0, ry: 0 }, 4).flatMap(caves.cavesIn);
const { terrainOn, linkAcross } = generatedLayers(world);

const floorsReachedFrom = (cave: Cave, within: readonly Cave[]): Set<string> => {
  const isWithin = (p: Point) => within.some((c) => distance(c, p) <= TERRITORY_RADIUS + 1);
  const start = { layer: SURFACE as Layer, p: caves.planOf(cave).mouth.outside };
  const keyOf = ({ layer, p }: typeof start) => `${layerKey(layer)} ${p.x},${p.y}`;
  const floors = new Set<string>();
  const seen = new Set([keyOf(start)]);
  const frontier = [start];
  while (frontier.length > 0) {
    const { layer, p } = frontier.pop()!;
    if (layer !== SURFACE) floors.add(layerKey(layer));
    for (const o of NEIGHBOURS) {
      const to = { x: p.x + o.x, y: p.y + o.y };
      const beyond = linkAcross(layer, p, to) ?? layer;
      if ((layer === SURFACE && beyond === SURFACE) || !isWithin(to)) continue;
      const next = { layer: beyond, p: to };
      if (seen.has(keyOf(next)) || blockerBetween(terrainOn(layer)(p.x, p.y), terrainOn(beyond)(to.x, to.y))) continue;
      seen.add(keyOf(next));
      frontier.push(next);
    }
  }
  return floors;
};

describe("caves", () => {
  it("lead walkers in at the mouth and down every floor by ramps", { tags: "slow" }, () => {
    const cave = nearby.find((c) => caves.planOf(c).bottom <= -3 && caves.junctionsOf(c).length === 0)!;
    const { top, bottom } = caves.planOf(cave);
    expect(floorsReachedFrom(cave, [cave]).size).toBe(top - bottom + 1);
  });

  it("lead walkers through junctions into neighbouring caves", { tags: "slow" }, () => {
    const cave = nearby.find((c) => caves.junctionsOf(c).length > 0)!;
    const [junction] = caves.junctionsOf(cave);
    const reached = floorsReachedFrom(cave, [cave, junction!.other.cave]);
    expect(reached).toContain(layerKey(junction!.other));
  });

  it("lead walkers in at a mine's entrance and down every floor it works", { tags: "slow" }, () => {
    const cave = nearby.find((c) => caves.planOf(c).mine)!;
    const { top, bottom } = caves.planOf(cave).mine!;
    const reached = floorsReachedFrom(cave, [cave]);
    for (let floor = top; floor >= bottom; floor--) expect(reached).toContain(layerKey({ cave, floor }));
  });
});
