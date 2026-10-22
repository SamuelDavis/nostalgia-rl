import { parseArgs } from "node:util";
import { floorDiv, memoize } from "procgen";
import {
  CHUNK_SIZE,
  type Chunk,
  Cover,
  Prop,
  Ground,
  Water,
  Way,
  createWorldgen,
  generateChunk,
  heightLevel,
  tileIndex,
} from "../src/worldgen";
import {
  type Mark,
  createOverviewTint,
  fieldColor,
  markPixels,
  overviewFeatureMarks,
  overviewMarks,
} from "../src/view/overview";
import {
  HEIGHT_MODES,
  type HeightMode,
  type Rgb,
  coverColor,
  hillshade,
  propColor,
  groundColor,
  shade,
  surfaceColor,
  waterColor,
  wayColor,
} from "../src/view/palette";
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
const chunkAt = (x: number, y: number) => generatedChunk({ cx: floorDiv(x, CHUNK_SIZE), cy: floorDiv(y, CHUNK_SIZE) });

const heightAt = (x: number, y: number) => {
  const chunk = chunkAt(x, y);
  return chunk.height[tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE)]!;
};

const CANOPY_SHADE = 0.55;

const tileColor = (x: number, y: number): Rgb => {
  const chunk = chunkAt(x, y);
  const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
  const cover = chunk.cover[i] as Cover;
  if (cover === Cover.Thatch || cover === Cover.Slate) return coverColor[cover];
  const color = uncoveredColor(chunk, i, x, y);
  return cover === Cover.None ? color : shade(color, CANOPY_SHADE);
};

const uncoveredColor = (chunk: Chunk, i: number, x: number, y: number): Rgb => {
  const prop = chunk.prop[i] as Prop;
  const water = chunk.water[i] as Water;
  if (prop !== Prop.None) return propColor[prop];
  if (water !== Water.None) return waterColor[water];
  const way = chunk.way[i] as Way;
  if (way !== Way.None) return wayColor[way];
  const height = chunk.height[i]!;
  const light = hillshade(height - heightAt(x - 1, y), height - heightAt(x, y - 1));
  return surfaceColor(mode, groundColor[chunk.ground[i] as Ground], height, light);
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
