import { floorDiv } from "../lib";
import { Direction, isSwimming } from "../game/movement";
import type { Session } from "../game/session";
import type { Tile } from "../game/terrain";
import { Biome, CHUNK_SIZE, METRES_PER_LEVEL, Prop, Ground, SEA_LEVEL, Water, type Worldgen } from "../worldgen";
import type { HeightMode } from "./palette";

export interface HudState {
  readonly session: Session;
  readonly turnMs: number;
  readonly tile: Tile;
  readonly mode: HeightMode;
}

const nameOf = (values: Record<string, number>, value: number): string =>
  Object.keys(values).find((key) => values[key] === value) ?? String(value);

const fixed = (value: number) => value.toFixed(3);

export const createHud = (parent: HTMLElement, world: Worldgen) => {
  const panel = document.createElement("aside");
  panel.className = "hud";
  const table = document.createElement("dl");
  const help = document.createElement("p");
  help.textContent = "WASD move · M map · H height mode";
  panel.append(table, help);
  parent.append(panel);
  const values = new Map<string, HTMLElement>();

  const show = (label: string, value: string) => {
    let dd = values.get(label);
    if (!dd) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      dd = document.createElement("dd");
      values.set(label, dd);
      table.append(dt, dd);
    }
    if (dd.textContent !== value) dd.textContent = value;
  };

  const update = ({ session, turnMs, tile, mode }: HudState) => {
    const { turn, facing, blocked } = session;
    const { x, y } = session.position;
    const { elevation, temperature, moisture, drainage, landform } = world.fields;
    const form = landform(x + 0.5, y + 0.5);
    const region = world.regionOf({ x, y });
    const rows: [string, string][] = [
      ["seed", String(world.seed)],
      ["turn", `${turn} @ ${turnMs} ms`],
      ["position", `${x}, ${y}`],
      ["chunk", `${floorDiv(x, CHUNK_SIZE)}, ${floorDiv(y, CHUNK_SIZE)}`],
      ["region", `${region.cx}, ${region.cy}`],
      ["facing", nameOf(Direction, facing)],
      ["blocked", blocked ?? "—"],
      ["swimming", isSwimming(tile) ? "yes" : "no"],
      ["height", `${tile.height} (${(tile.height - SEA_LEVEL) * METRES_PER_LEVEL} m above sea)`],
      ["elevation", fixed(elevation(x + 0.5, y + 0.5))],
      ["biome", nameOf(Biome, tile.biome)],
      ["ground", nameOf(Ground, tile.ground)],
      ["water", nameOf(Water, tile.water)],
      ["prop", nameOf(Prop, tile.prop)],
      ["temperature", fixed(temperature(x + 0.5, y + 0.5))],
      ["moisture", fixed(moisture(x + 0.5, y + 0.5))],
      ["drainage", fixed(drainage(x + 0.5, y + 0.5))],
      ["continentalness", fixed(form.continentalness)],
      ["erosion", fixed(form.erosion)],
      ["peaks & valleys", fixed(form.peaksAndValleys)],
      ["height mode", mode],
    ];
    for (const [label, value] of rows) show(label, value);
  };

  return { update };
};
