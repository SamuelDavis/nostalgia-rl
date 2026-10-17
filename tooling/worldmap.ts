import { parseArgs } from "node:util";
import { floorDiv } from "../src/lib";
import { CHUNK_SIZE, Prop, Ground, Water, Way, createWorldgen, generateChunk, tileIndex } from "../src/worldgen";
import { fieldColor, overviewMarks } from "../src/view/overview";
import {
  HEIGHT_MODES,
  type HeightMode,
  type Rgb,
  propColor,
  groundColor,
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

const tileColor = (x: number, y: number): Rgb => {
  const chunk = generateChunk(world, floorDiv(x, CHUNK_SIZE), floorDiv(y, CHUNK_SIZE));
  const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
  const prop = chunk.prop[i] as Prop;
  const water = chunk.water[i] as Water;
  if (prop !== Prop.None) return propColor[prop];
  if (water !== Water.None) return waterColor[water];
  const way = chunk.way[i] as Way;
  if (way !== Way.None) return wayColor[way];
  return surfaceColor(mode, groundColor[chunk.ground[i] as Ground], chunk.height[i]!);
};

const overlay = new Map<string, Rgb>();
if (values.layer !== "tiles")
  for (const { point, color } of overviewMarks(world, { x: centerX, y: centerY }, (size * scale) / 2))
    overlay.set(
      `${Math.round((point.x - centerX) / scale + size / 2)},${Math.round((point.y - centerY) / scale + size / 2)}`,
      color,
    );

writePng(values.out!, size, size, (px, py) => {
  const { x, y } = worldAt(px, py);
  return values.layer === "tiles"
    ? tileColor(Math.floor(x), Math.floor(y))
    : (overlay.get(`${px},${py}`) ?? fieldColor(world, mode, x, y));
});
console.log(`wrote ${values.out}`);
