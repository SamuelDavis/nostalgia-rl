import { parseArgs } from "node:util";
import { memoize } from "procgen";
import { createTerrain } from "../src/game/terrain";
import { Cover, createWorldgen, generateChunk, heightLevel } from "../src/worldgen";
import {
  type Mark,
  createOverviewTint,
  fieldColor,
  markPixels,
  overviewFeatureMarks,
  overviewMarks,
} from "../src/view/overview";
import { HEIGHT_MODES, type HeightMode, type Rgb, coverColor, hillshade, mapColorOf, shade } from "../src/view/palette";
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
  if (tile.cover === Cover.Thatch || tile.cover === Cover.Slate) return coverColor[tile.cover];
  const light = hillshade(tile.height - terrain(x - 1, y).height, tile.height - terrain(x, y - 1).height);
  const color = mapColorOf(tile, mode, light);
  return tile.cover === Cover.None ? color : shade(color, CANOPY_SHADE);
};

const center = { x: centerX, y: centerY };
const radius = (size * scale) / 2;
const isTiles = values.layer === "tiles";
const tint = createOverviewTint(world, center, radius);

const overlay = new Map<string, Rgb>();
const marks: Mark[] = isTiles ? overviewFeatureMarks(world, center, radius) : overviewMarks(world, center, radius);
for (const mark of marks) {
  const px = Math.round((mark.point.x - centerX) / scale + size / 2);
  const py = Math.round((mark.point.y - centerY) / scale + size / 2);
  for (const o of markPixels(mark)) overlay.set(`${px + o.x},${py + o.y}`, mark.color);
}

writePng(values.out!, size, size, (px, py) => {
  const { x, y } = worldAt(px, py);
  return (
    overlay.get(`${px},${py}`) ??
    (isTiles
      ? tileColor(Math.floor(x), Math.floor(y))
      : tint(
          fieldColor(mode, world.fields.conditions(x, y), {
            westLevel: heightLevel(world.fields.elevation(x - scale, y)),
            northLevel: heightLevel(world.fields.elevation(x, y - scale)),
            spacing: scale,
          }),
          { x, y },
        ))
  );
});
console.log(`wrote ${values.out}`);
