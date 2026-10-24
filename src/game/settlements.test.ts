import { describe, expect, it } from "vitest";
import { type Vec2, contains, memoize } from "procgen";
import { Cover, type Layer, Prop, SURFACE, Way, createWorldgen, layerKey, regions } from "../worldgen";
import { type Building, footprintOf } from "../worldgen/features/building/building";
import { blockerBetween } from "./movement";
import { generatedLayers } from "./terrain";

const NEIGHBOURS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const SEEDS = [1, 2, 3];

const settlementsOf = memoize(
  (seed: number) => {
    const world = createWorldgen(seed);
    const layers = generatedLayers(world);
    const placed = [...new Set(regions.cellsAround({ col: 0, row: 0 }, 4).flatMap(world.settlementsIn))];
    return { layers, terrain: layers.terrainOn(SURFACE), settlements: placed.map(({ layout }) => layout) };
  },
  String,
  3,
);

const layerOn = (building: Building, floor: number): Layer =>
  floor === 0 ? SURFACE : { building: building.door, floor };

describe("settlements", () => {
  it("are found across the world in every tier", { tags: "slow" }, () => {
    const tiers = new Set(
      SEEDS.flatMap((seed) => settlementsOf(seed).settlements.map(({ settlement }) => settlement.tier)),
    );
    expect([...tiers].sort()).toEqual([0, 1, 2]);
  });

  it(
    "let walkers in from the street through every door and up the stairs to every floor tile",
    { tags: "slow" },
    () => {
      for (const seed of SEEDS) {
        const { layers, terrain, settlements } = settlementsOf(seed);
        for (const { buildings } of settlements)
          for (const building of buildings) {
            const steps = [...building.path].reverse();
            const street = NEIGHBOURS.map((o) => ({
              x: (steps[0] ?? building.door).x + o.x,
              y: (steps[0] ?? building.door).y + o.y,
            })).find(
              (p) => terrain(p.x, p.y).way !== Way.None && !building.path.some((q) => q.x === p.x && q.y === p.y),
            );
            expect(street, `street by ${building.plan.kind} at ${building.door.x},${building.door.y}`).toBeDefined();
            const keyOf = (layer: Layer, p: Vec2) => `${layerKey(layer)} ${p.x},${p.y}`;
            const seen = new Set([keyOf(SURFACE, street!)]);
            const frontier = [{ layer: SURFACE as Layer, p: street! }];
            while (frontier.length > 0) {
              const { layer, p } = frontier.pop()!;
              for (const o of NEIGHBOURS) {
                const to = { x: p.x + o.x, y: p.y + o.y };
                const beyond = layers.linkAcross(layer, p, to) ?? layer;
                const isOnRoute =
                  contains(building.bounds, to) || building.path.some((q) => q.x === to.x && q.y === to.y);
                const blocked = blockerBetween(layers.terrainOn(layer)(p.x, p.y), layers.terrainOn(beyond)(to.x, to.y));
                if (seen.has(keyOf(beyond, to)) || !isOnRoute || blocked) continue;
                seen.add(keyOf(beyond, to));
                frontier.push({ layer: beyond, p: to });
              }
            }
            building.plan.floors.forEach((_, floor) => {
              const layer = layerOn(building, floor);
              for (const p of footprintOf(building))
                if (layers.terrainOn(layer)(p.x, p.y).prop === Prop.None)
                  expect(seen.has(keyOf(layer, p)), `${building.plan.kind} ${layerKey(layer)} ${p.x},${p.y}`).toBe(
                    true,
                  );
            });
          }
      }
    },
  );

  it("raise some buildings to two storeys and some to three", { tags: "slow" }, () => {
    const storeys = new Set(
      SEEDS.flatMap((seed) =>
        settlementsOf(seed).settlements.flatMap(({ buildings }) => buildings.map(({ plan }) => plan.floors.length)),
      ),
    );
    expect([...storeys].sort()).toEqual([1, 2, 3]);
  });

  it("roof every building but its doors", { tags: "slow" }, () => {
    for (const seed of SEEDS) {
      const { terrain, settlements } = settlementsOf(seed);
      for (const { buildings } of settlements)
        for (const building of buildings)
          for (const p of footprintOf(building)) {
            const tile = terrain(p.x, p.y);
            expect(tile.cover === Cover.None, `${p.x},${p.y}`).toBe(tile.prop === Prop.Door);
          }
    }
  });
});
