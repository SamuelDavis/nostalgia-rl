import { parseArgs } from "node:util";
import { floorDiv } from "../src/lib";
import {
  Biome,
  CHUNK_SIZE,
  Feature,
  Ground,
  MACRO_SIZE,
  Water,
  classifyBiome,
  createWorldgen,
  generateChunk,
  heightLevel,
  tileIndex,
} from "../src/worldgen";
import { type Rgb, writePng } from "./png";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    scale: { type: "string", default: "16" },
    size: { type: "string", default: "512" },
    x: { type: "string", default: "0" },
    y: { type: "string", default: "0" },
    layer: { type: "string", default: "biome" },
    out: { type: "string", default: "artifacts/map.png" },
  },
});

const scale = Number(values.scale);
const size = Number(values.size);
const centerX = Number(values.x);
const centerY = Number(values.y);
const world = createWorldgen(Number(values.seed));
const { fields } = world;

const biomeColor: Record<Biome, Rgb> = {
  [Biome.Ocean]: [40, 70, 140],
  [Biome.Beach]: [220, 205, 150],
  [Biome.Grassland]: [110, 170, 80],
  [Biome.Forest]: [40, 110, 50],
  [Biome.Desert]: [215, 180, 100],
  [Biome.Mountain]: [130, 120, 115],
};

const groundColor: Record<Ground, Rgb> = {
  [Ground.Grass]: [100, 165, 75],
  [Ground.Dirt]: [150, 110, 70],
  [Ground.Sand]: [220, 205, 150],
  [Ground.Rock]: [130, 120, 115],
  [Ground.Snow]: [235, 240, 245],
  [Ground.Road]: [175, 140, 95],
};

const featureColor: Partial<Record<Feature, Rgb>> = {
  [Feature.Oak]: [30, 90, 35],
  [Feature.Pine]: [20, 70, 50],
  [Feature.Cactus]: [60, 130, 60],
  [Feature.Bush]: [60, 120, 50],
  [Feature.Boulder]: [90, 85, 80],
  [Feature.Tent]: [200, 60, 40],
  [Feature.Campfire]: [255, 160, 0],
  [Feature.Bridge]: [120, 80, 40],
};

const shade = ([r, g, b]: Rgb, factor: number): Rgb => [r * factor, g * factor, b * factor];

const worldAt = (px: number, py: number) => ({
  x: centerX + (px - size / 2) * scale,
  y: centerY + (py - size / 2) * scale,
});

const fieldColor = (x: number, y: number): Rgb => {
  const elevation = fields.elevation(x, y);
  const biome = classifyBiome(elevation, fields.temperature(x, y), fields.moisture(x, y));
  return shade(biomeColor[biome], 0.6 + heightLevel(elevation) * 0.03);
};

const tileColor = (x: number, y: number): Rgb => {
  const chunk = generateChunk(world, floorDiv(x, CHUNK_SIZE), floorDiv(y, CHUNK_SIZE));
  const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
  const feature = featureColor[chunk.feature[i] as Feature];
  if (feature) return feature;
  if (chunk.water[i] === Water.Deep) return [30, 60, 130];
  if (chunk.water[i] === Water.Shallow) return [60, 110, 190];
  return shade(groundColor[chunk.ground[i] as Ground], 0.55 + chunk.height[i]! * 0.04);
};

const overlay = new Map<string, Rgb>();
const plot = (p: { x: number; y: number }, color: Rgb) => {
  overlay.set(
    `${Math.round((p.x - centerX) / scale + size / 2)},${Math.round((p.y - centerY) / scale + size / 2)}`,
    color,
  );
};

if (values.layer !== "tiles") {
  const span = Math.ceil((size * scale) / MACRO_SIZE / 2);
  const center = world.cellOf({ x: centerX, y: centerY });
  for (let cy = center.cy - span; cy <= center.cy + span; cy++)
    for (let cx = center.cx - span; cx <= center.cx + span; cx++) {
      for (const river of world.riversNear(cx, cy)) for (const node of river.nodes) plot(node, [70, 140, 230]);
      for (const road of world.roadsFrom(cx, cy)) for (const node of road.nodes) plot(node, [120, 70, 30]);
      const camp = world.campAt(cx, cy);
      if (camp) plot(camp, [0, 0, 0]);
    }
}

writePng(values.out!, size, size, (px, py) => {
  const { x, y } = worldAt(px, py);
  return values.layer === "tiles"
    ? tileColor(Math.floor(x), Math.floor(y))
    : (overlay.get(`${px},${py}`) ?? fieldColor(x, y));
});
console.log(`wrote ${values.out}`);
