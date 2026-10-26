import { parseArgs } from "node:util";
import { memoize } from "procgen";
import { createTerrain } from "../src/game/terrain";
import { Cover, createWorldgen, generateChunk } from "../src/worldgen";
import { pixelOf } from "../src/render/map/frame";
import { markPixels, overviewFeatureMarks, overviewImage } from "../src/render/map/overview";
import {
  HEIGHT_MODES,
  type HeightMode,
  type Rgb,
  coverColor,
  hillshade,
  mapColorOf,
  shade,
} from "../src/render/palette";
import { writePng } from "./png";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    scale: { type: "string", default: "16" },
    size: { type: "string", default: "512" },
    x: { type: "string", default: "0" },
    y: { type: "string", default: "0" },
    layer: { type: "string", default: "biome" },
    height: { type: "string", default: "shade" },
    out: { type: "string", default: "artifacts/map.png" },
  },
});

if (!HEIGHT_MODES.includes(values.height as HeightMode)) throw new Error(`--height must be one of ${HEIGHT_MODES}`);
const mode = values.height as HeightMode;
const scale = Number(values.scale);
const size = Number(values.size);
const centerX = Number(values.x);
const centerY = Number(values.y);
const world = createWorldgen(Number(values.seed));

const worldAt = (px: number, py: number) => ({
  x: centerX + (px - size / 2) * scale,
  y: centerY + (py - size / 2) * scale,
});

const CHUNK_CACHE = 4096;
const generatedChunk = memoize(
  ({ cx, cy }: { cx: number; cy: number }) => generateChunk(world, cx, cy),
  ({ cx, cy }) => `${cx},${cy}`,
  CHUNK_CACHE,
);
const terrain = createTerrain((cx, cy) => generatedChunk({ cx, cy }));

const CANOPY_SHADE = 0.55;

const tileColor = (x: number, y: number): Rgb => {
  const tile = terrain(x, y);
  if (tile.cover === Cover.Thatch || tile.cover === Cover.Slate || tile.cover === Cover.Rock)
    return coverColor[tile.cover];
  const light = hillshade(tile.height - terrain(x - 1, y).height, tile.height - terrain(x, y - 1).height);
  const color = mapColorOf(tile, mode, light);
  return tile.cover === Cover.None ? color : shade(color, CANOPY_SHADE);
};

const frame = { center: { x: centerX, y: centerY }, size, scale };

const tilesColorAt = () => {
  const overlay = new Map<string, Rgb>();
  for (const mark of overviewFeatureMarks(world, frame.center, (size * scale) / 2)) {
    const { col, row } = pixelOf(frame, mark.point);
    for (const o of markPixels(mark)) overlay.set(`${col + o.x},${row + o.y}`, mark.color);
  }
  return (px: number, py: number) => {
    const { x, y } = worldAt(px, py);
    return overlay.get(`${px},${py}`) ?? tileColor(Math.floor(x), Math.floor(y));
  };
};

const overviewColorAt = () => {
  const pixels = overviewImage(world, mode, frame);
  return (px: number, py: number): Rgb => {
    const i = (py * size + px) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  };
};

writePng(values.out!, size, size, values.layer === "tiles" ? tilesColorAt() : overviewColorAt());
console.log(`wrote ${values.out}`);
