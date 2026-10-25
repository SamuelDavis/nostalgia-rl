import { floorDiv } from "procgen";
import { Direction, isSwimming } from "../game/movement";
import type { Session } from "../game/session";
import type { Tile } from "../game/terrain";
import type { HeightMode } from "../render/palette";
import type { Zoom } from "../render/top-down/framing";
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

export type Row = readonly [label: string, value: string];

const nameOf = (values: Record<string, number>, value: number): string =>
  Object.keys(values).find((key) => values[key] === value) ?? String(value);

const fixed = (value: number) => value.toFixed(3);

export const describePurpose = ({ role, occupants, produces, relation }: Purpose): string =>
  [
    occupants.length > 0 ? `${role} of ${occupants.join(" and ")}` : role,
    ...(produces.length > 0 ? [`makes ${produces.join(" and ")}`] : []),
    ...(relation ? [`${relation.kind} ${relation.target.x}, ${relation.target.y}`] : []),
  ].join(", ");

export const sessionRows = (world: Worldgen, session: Session, tile: Tile, turnMs: number): Row[] => {
  const { turn, facing, blocked } = session;
  const { x, y } = session.position;
  const { elevation, temperature, moisture, drainage, landform } = world.fields;
  const form = landform(x + 0.5, y + 0.5);
  const region = regions.cellOf({ x, y });
  const building = world.buildingAt(session.position);
  const place = world.placeAt(session.position);
  return [
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
    ["place", place ? `${place.name}: ${describePurpose(place.purpose)}` : "—"],
    ["building", building ? `${building.plan.kind}, door at ${building.door.x}, ${building.door.y}` : "—"],
    ["facing", nameOf(Direction, facing)],
    ["blocked", !blocked ? "—" : blocked.blocker === "obstacle" ? `by ${nameOf(Prop, blocked.prop)}` : blocked.blocker],
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
  ];
};

export const inputRows = (tapTurnsFirst: boolean): Row[] => [["tap", tapTurnsFirst ? "turns, then steps" : "steps"]];

export const topDownRows = (zoom: Zoom, mode: HeightMode): Row[] => [
  ["height mode", mode],
  ["view", `${zoom.span} (settles ${zoom.natural}) ${zoom.modifier < 0 ? "−" : "+"} ${Math.abs(zoom.modifier)} tiles`],
];
