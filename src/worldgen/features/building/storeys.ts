import { type Vec2, contains } from "procgen";
import type { Chunk } from "../../chunk";
import { CHUNK_SIZE } from "../../constants";
import { type Layer, SURFACE, type Storey, isStorey } from "../../layer";
import { Ground, Water, Way } from "../../terrain";
import { toLocal } from "../frame";
import { STOREY, cellOf, riseOf, stairTiles } from "./plan";
import type { Building } from "./building";

export type BuildingAt = (p: Vec2) => Building | undefined;

const isAt = (a: Vec2, b: { readonly u: number; readonly v: number }) => a.x === b.u && a.y === b.v;

const localOf = (building: Building, p: Vec2): Vec2 => {
  const { u, v } = toLocal(building.frame, p);
  return { x: u, y: v };
};

export const levelOf = (building: Building, floor: number, p: Vec2): number => {
  const { x: u, y: v } = localOf(building, p);
  return building.level + floor * STOREY + riseOf(building.plan, floor, u, v);
};

export const storeyLinks =
  (buildingAt: BuildingAt) =>
  (layer: typeof SURFACE | Storey, from: Vec2, to: Vec2): Layer | undefined => {
    const floor = isStorey(layer) ? layer.floor : 0;
    const building = buildingAt(isStorey(layer) ? layer.building : from);
    if (!building || !contains(building.bounds, from) || !contains(building.bounds, to)) return undefined;
    const [here, there] = [localOf(building, from), localOf(building, to)];
    const layerOn = (target: number): Layer => (target === 0 ? SURFACE : { building: building.door, floor: target });
    for (const stairs of building.plan.stairs) {
      const { flight, landing } = stairTiles(stairs);
      const top = flight.at(-1)!;
      if (stairs.from === floor && isAt(here, top) && isAt(there, landing)) return layerOn(floor + 1);
      if (stairs.from === floor - 1 && isAt(here, landing) && isAt(there, top)) return layerOn(floor - 1);
    }
    return undefined;
  };

export const storeyChunk = (surface: Chunk, building: Building | undefined, layer: Storey): Chunk => {
  const chunk = {
    ...surface,
    layer,
    height: surface.height.slice(),
    ground: surface.ground.slice(),
    water: surface.water.slice(),
    prop: surface.prop.slice(),
    part: surface.part.slice(),
    way: surface.way.slice(),
    cover: surface.cover.slice(),
  };
  if (!building || layer.floor >= building.plan.floors.length) return chunk;
  for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
    const p = {
      x: surface.cx * CHUNK_SIZE + (i % CHUNK_SIZE),
      y: surface.cy * CHUNK_SIZE + Math.floor(i / CHUNK_SIZE),
    };
    if (!contains(building.bounds, p)) continue;
    const { x: u, y: v } = localOf(building, p);
    chunk.height[i] = levelOf(building, layer.floor, p);
    chunk.ground[i] = Ground.Planks;
    chunk.water[i] = Water.None;
    chunk.prop[i] = cellOf(building.plan, u, v, layer.floor);
    chunk.part[i] = 0;
    chunk.way[i] = Way.None;
    chunk.cover[i] = building.roof;
  }
  return chunk;
};
