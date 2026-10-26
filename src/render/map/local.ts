import { floorDiv } from "procgen";
import type { ChunkCoord } from "../../game/chunk-store";
import type { Terrain } from "../../game/terrain";
import { CHUNK_SIZE } from "../../worldgen";
import { type HeightMode, hillshade, mapColorOf } from "../palette";
import { type MapFrame, type Pixels, createPixels, pointAt } from "./frame";

const chunkSpan = (centre: number, size: number) => {
  const first = floorDiv(centre - size / 2 - 1, CHUNK_SIZE);
  return Array.from({ length: floorDiv(centre + size / 2 - 1, CHUNK_SIZE) - first + 1 }, (_, i) => first + i);
};

export const chunksUnder = ({ center, size }: MapFrame): ChunkCoord[] =>
  chunkSpan(center.y, size).flatMap((cy) => chunkSpan(center.x, size).map((cx) => ({ cx, cy })));

export const localImage = (terrain: Terrain, mode: HeightMode, frame: MapFrame): Pixels => {
  const pixels = createPixels(frame.size);
  const { x: left, y: top } = pointAt(frame, 0, 0);
  let north = Array.from({ length: frame.size }, (_, col) => terrain(left + col, top - 1).height);
  for (let row = 0; row < frame.size; row++) {
    const here: number[] = [];
    let west = terrain(left - 1, top + row).height;
    for (let col = 0; col < frame.size; col++) {
      const tile = terrain(left + col, top + row);
      pixels.set(col, row, mapColorOf(tile, mode, hillshade(tile.height - west, tile.height - north[col]!)));
      here.push(tile.height);
      west = tile.height;
    }
    north = here;
  }
  return pixels.data;
};
