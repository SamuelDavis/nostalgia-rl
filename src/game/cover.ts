import type { Vec2 } from "procgen";
import { Cover } from "../worldgen";
import { NEIGHBOURS, isTrail } from "./movement";
import type { Terrain, Tile } from "./terrain";

export interface Interior {
  readonly key: string;
  readonly contains: (x: number, y: number, tile: Tile) => boolean;
}

const OUTSIDE: Interior = { key: "outside", contains: () => false };
const UNDER_CANOPY: Interior = { key: "canopy", contains: (_x, _y, tile) => tile.cover === Cover.Canopy };
const MAX_ROOFED_TILES = 4096;

const roofedRoom = (terrain: Terrain, from: Vec2, cover: Cover): Interior => {
  const tiles = new Set<string>();
  const queue = [from];
  while (queue.length > 0 && tiles.size < MAX_ROOFED_TILES) {
    const { x, y } = queue.pop()!;
    const key = `${x},${y}`;
    if (tiles.has(key) || terrain(x, y).cover !== cover) continue;
    tiles.add(key);
    for (const o of NEIGHBOURS) queue.push({ x: x + o.x, y: y + o.y });
  }
  const [first] = [...tiles].sort();
  return { key: `roof ${first}`, contains: (x, y) => tiles.has(`${x},${y}`) };
};

export const interiorOf = (terrain: Terrain, { x, y }: Vec2): Interior => {
  const { cover } = terrain(x, y);
  if (cover === Cover.None) return OUTSIDE;
  return cover === Cover.Canopy ? UNDER_CANOPY : roofedRoom(terrain, { x, y }, cover);
};

export const isForestGate = (terrain: Terrain, x: number, y: number): boolean => {
  const tile = terrain(x, y);
  return (
    isTrail(tile) &&
    tile.cover === Cover.None &&
    NEIGHBOURS.some((o) => {
      const next = terrain(x + o.x, y + o.y);
      return isTrail(next) && next.cover !== Cover.None;
    })
  );
};
