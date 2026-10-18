import { describe, expect, it } from "vitest";
import type { Point } from "../lib";
import { type Layer, SURFACE, createWorldgen, findPeak, layerKey, regionsAround } from "../worldgen";
import { createCaves } from "../worldgen/caves/caves";
import { TERRITORY_RADIUS } from "../worldgen/caves/siting";
import { blockerBetween } from "./movement";
import { generatedLayers } from "./terrain";

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

describe("caves", () => {
  it("lead walkers in at the mouth and down every floor by ramps", { tags: "slow" }, () => {
    const seed = 1;
    const world = createWorldgen(seed);
    const caves = createCaves({ seed, fields: world.fields, peakOf: (r) => findPeak(world.fields, r) });
    const cave = regionsAround({ rx: 0, ry: 0 }, 3)
      .flatMap(caves.cavesIn)
      .find((c) => caves.planOf(c).bottom <= -3)!;
    const { mouth, top, bottom } = caves.planOf(cave);
    const { terrainOn, linkAcross } = generatedLayers(world);

    const floorsReached = new Set<string>();
    const start = { layer: SURFACE as Layer, p: mouth.outside };
    const keyOf = ({ layer, p }: typeof start) => `${layerKey(layer)} ${p.x},${p.y}`;
    const seen = new Set([keyOf(start)]);
    const frontier = [start];
    while (frontier.length > 0) {
      const { layer, p } = frontier.pop()!;
      if (layer !== SURFACE) floorsReached.add(layerKey(layer));
      for (const o of NEIGHBOURS) {
        const to = { x: p.x + o.x, y: p.y + o.y };
        if (Math.max(Math.abs(to.x - cave.x), Math.abs(to.y - cave.y)) > TERRITORY_RADIUS) continue;
        const beyond = linkAcross(layer, p, to) ?? layer;
        if (layer === SURFACE && beyond === SURFACE) continue;
        const next = { layer: beyond, p: to };
        if (seen.has(keyOf(next)) || blockerBetween(terrainOn(layer)(p.x, p.y), terrainOn(beyond)(to.x, to.y)))
          continue;
        seen.add(keyOf(next));
        frontier.push(next);
      }
    }
    expect(floorsReached.size).toBe(top - bottom + 1);
  });
});
