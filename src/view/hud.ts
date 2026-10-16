import { type Point, floorDiv } from "../lib";
import { type Blocker, Direction } from "../game/movement";
import type { Tile } from "../game/terrain";
import { Biome, CHUNK_SIZE, Feature, Ground, Water, type Worldgen } from "../worldgen";
import type { HeightMode } from "./palette";

export interface HudState {
  readonly turn: number;
  readonly turnMs: number;
  readonly position: Point;
  readonly facing: Direction;
  readonly tile: Tile;
  readonly blocked: Blocker | undefined;
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

  const update = ({ turn, turnMs, position: { x, y }, facing, tile, blocked, mode }: HudState) => {
    const { elevation, temperature, moisture, drainage } = world.fields;
    const cell = world.cellOf({ x, y });
    const rows: [string, string][] = [
      ["seed", String(world.seed)],
      ["turn", `${turn} @ ${turnMs} ms`],
      ["position", `${x}, ${y}`],
      ["chunk", `${floorDiv(x, CHUNK_SIZE)}, ${floorDiv(y, CHUNK_SIZE)}`],
      ["macro cell", `${cell.cx}, ${cell.cy}`],
      ["facing", nameOf(Direction, facing)],
      ["blocked", blocked ?? "—"],
      ["height", `${tile.height} (elevation ${fixed(elevation(x + 0.5, y + 0.5))})`],
      ["biome", nameOf(Biome, tile.biome)],
      ["ground", nameOf(Ground, tile.ground)],
      ["water", nameOf(Water, tile.water)],
      ["feature", nameOf(Feature, tile.feature)],
      ["temperature", fixed(temperature(x + 0.5, y + 0.5))],
      ["moisture", fixed(moisture(x + 0.5, y + 0.5))],
      ["drainage", fixed(drainage(x + 0.5, y + 0.5))],
      ["height mode", mode],
    ];
    table.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  };

  return { update };
};
