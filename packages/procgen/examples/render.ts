import { createWorld, indexOf } from "../src";
import { Prop, Zone, createIsland } from "./island";

declare const process: { readonly argv: readonly string[] };
declare const console: { log(line: string): void };

const [seed = 11, x0 = -160, y0 = -80, width = 320, height = 160] = process.argv.slice(2, 7).map(Number);
const island = createIsland(seed);
const world = createWorld(seed);
const ZONE_GLYPHS: Record<Zone, string> = { 0: "~", 1: ":", 2: ".", 3: ",", 4: "_", 5: "^" };
const PROP_GLYPHS: Partial<Record<Prop, string>> = { [Prop.Tree]: "♣", [Prop.Hut]: "#", [Prop.Well]: "o" };
const [STRIDE = 2] = process.argv.slice(7).map(Number);

for (let y = y0; y < y0 + height; y += STRIDE) {
  let row = "";
  for (let x = x0; x < x0 + width; x += STRIDE) {
    const chunk = world.readAt(island.chunkAt, { x, y });
    const i = indexOf(chunk, x, y);
    const prop = chunk.columns.prop[i] as Prop;
    row += PROP_GLYPHS[prop] ?? (chunk.columns.road[i] ? "=" : ZONE_GLYPHS[chunk.columns.zone[i] as Zone]);
  }
  console.log(row);
}
