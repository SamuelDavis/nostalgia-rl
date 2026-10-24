import { floorDiv } from "procgen";
import { Direction, isSwimming } from "../game/movement";
import type { Session } from "../game/session";
import type { Tile } from "../game/terrain";
import {
  Biome,
  CHUNK_SIZE,
  METRES_PER_LEVEL,
  Prop,
  Ground,
  SEA_LEVEL,
  SURFACE,
  isStorey,
  Water,
  type Purpose,
  type Worldgen,
  regions,
} from "../worldgen";
import type { HeightMode } from "./palette";

export interface HudState {
  readonly session: Session;
  readonly turnMs: number;
  readonly tile: Tile;
  readonly mode: HeightMode;
  readonly tapTurnsFirst: boolean;
  readonly zoom: { readonly span: number; readonly natural: number; readonly modifier: number };
}

const nameOf = (values: Record<string, number>, value: number): string =>
  Object.keys(values).find((key) => values[key] === value) ?? String(value);

export interface Control {
  readonly keys: readonly string[];
  readonly label: string;
  readonly run: () => void;
}

const fixed = (value: number) => value.toFixed(3);

export const describePurpose = ({ role, occupants, produces, relation }: Purpose): string =>
  [
    occupants.length > 0 ? `${role} of ${occupants.join(" and ")}` : role,
    ...(produces.length > 0 ? [`makes ${produces.join(" and ")}`] : []),
    ...(relation ? [`${relation.kind} ${relation.target.x}, ${relation.target.y}`] : []),
  ].join(", ");

export const createHud = (parent: HTMLElement, world: Worldgen, controls: readonly Control[]) => {
  const panel = document.createElement("aside");
  panel.className = "hud";
  const table = document.createElement("dl");
  const help = document.createElement("p");
  help.textContent = "WASD or tap move · wheel zoom";
  table.hidden = true;
  help.hidden = true;
  const buttons = document.createElement("menu");
  buttons.append(
    ...controls.map(({ label, run }) => {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", run);
      return button;
    }),
  );
  panel.append(buttons, table, help);
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

  const update = ({ session, turnMs, tile, mode, zoom, tapTurnsFirst }: HudState) => {
    const { turn, facing, blocked } = session;
    const { x, y } = session.position;
    const { elevation, temperature, moisture, drainage, landform } = world.fields;
    const form = landform(x + 0.5, y + 0.5);
    const region = regions.cellOf({ x, y });
    const building = world.buildingAt(session.position);
    const place = world.minorAt(session.position);
    const rows: [string, string][] = [
      ["seed", String(world.seed)],
      ["turn", `${turn} @ ${turnMs} ms`],
      ["position", `${x}, ${y}`],
      ["chunk", `${floorDiv(x, CHUNK_SIZE)}, ${floorDiv(y, CHUNK_SIZE)}`],
      ["region", `${region.col}, ${region.row}`],
      [
        "floor",
        session.layer === SURFACE
          ? "surface"
          : isStorey(session.layer)
            ? `storey ${session.layer.floor + 1}`
            : `${session.layer.floor} of cave at ${session.layer.cave.x}, ${session.layer.cave.y}`,
      ],
      ["province", world.provinceAt(session.position).identity],
      ["place", place ? `${place.site.kind}: ${describePurpose(place.purpose)}` : "—"],
      ["building", building ? `${building.plan.kind}, door at ${building.door.x}, ${building.door.y}` : "—"],
      ["facing", nameOf(Direction, facing)],
      ["tap", tapTurnsFirst ? "turns, then steps" : "steps"],
      [
        "blocked",
        !blocked ? "—" : blocked.blocker === "obstacle" ? `by ${nameOf(Prop, blocked.prop)}` : blocked.blocker,
      ],
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
      [
        "view",
        `${zoom.span} (settles ${zoom.natural}) ${zoom.modifier < 0 ? "−" : "+"} ${Math.abs(zoom.modifier)} tiles`,
      ],
    ];
    for (const [label, value] of rows) show(label, value);
  };

  const toggle = () => {
    table.hidden = !table.hidden;
    help.hidden = table.hidden;
  };

  return { update, toggle };
};
