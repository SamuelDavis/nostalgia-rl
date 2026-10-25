import { type Vec2, clamp } from "procgen";
import { type Layer, type Prop, SURFACE } from "../worldgen";
import {
  BODY_RADIUS,
  Direction,
  STEP_TICKS,
  TILE_UNITS,
  edgeBetween,
  isImpassable,
  stepToward,
  unitsPerTick,
} from "./movement";
import type { Layers } from "./terrain";

const HALF = TILE_UNITS / 2;

export interface Climb {
  readonly to: Vec2;
  readonly layer: Layer;
  readonly spent: number;
  readonly ticks: number;
}

export interface Session {
  readonly tick: number;
  readonly position: Vec2;
  readonly offset: Vec2;
  readonly layer: Layer;
  readonly facing: Direction;
  readonly drive: number;
  readonly climb: Climb | undefined;
  readonly blocked: Prop | undefined;
}

export interface Action {
  readonly kind: "face" | "step" | "push";
  readonly direction: Direction;
}

export const startSession = (position: Vec2): Session => ({
  tick: 0,
  position,
  offset: { x: 0, y: 0 },
  layer: SURFACE,
  facing: Direction.South,
  drive: 0,
  climb: undefined,
  blocked: undefined,
});

const OPPOSITE: Record<Direction, Direction> = {
  [Direction.North]: Direction.South,
  [Direction.East]: Direction.West,
  [Direction.South]: Direction.North,
  [Direction.West]: Direction.East,
};

const axisOf = (direction: Direction) => {
  const { x, y } = stepToward({ x: 0, y: 0 }, direction);
  return { axis: x !== 0 ? ("x" as const) : ("y" as const), sign: x + y };
};

const neighbourOf = ({ position, layer }: Session, { terrainOn, linkAcross }: Layers, direction: Direction) => {
  const at = stepToward(position, direction);
  const beyond = linkAcross(layer, position, at) ?? layer;
  return { at, layer: beyond, tile: terrainOn(beyond)(at.x, at.y) };
};

const AROUND: readonly Vec2[] = [-1, 0, 1].flatMap((dy) =>
  [-1, 0, 1].flatMap((dx) => (dx === 0 && dy === 0 ? [] : [{ x: dx, y: dy }])),
);

const collide = (
  { position, layer }: Session,
  { terrainOn, linkAcross }: Layers,
  offset: Vec2,
): { offset: Vec2; blocked: Prop | undefined } => {
  let p = offset;
  let blocked: Prop | undefined;
  for (const around of AROUND) {
    const at = { x: position.x + around.x, y: position.y + around.y };
    const isCardinal = around.x === 0 || around.y === 0;
    const tile = terrainOn((isCardinal && linkAcross(layer, position, at)) || layer)(at.x, at.y);
    if (!isImpassable(tile)) continue;
    const nearest = {
      x: clamp(p.x, around.x * TILE_UNITS - HALF, around.x * TILE_UNITS + HALF),
      y: clamp(p.y, around.y * TILE_UNITS - HALF, around.y * TILE_UNITS + HALF),
    };
    const [dx, dy] = [p.x - nearest.x, p.y - nearest.y];
    const squared = dx * dx + dy * dy;
    if (squared >= BODY_RADIUS * BODY_RADIUS || squared === 0) continue;
    const distance = Math.sqrt(squared);
    p = {
      x: nearest.x + Math.round((dx * BODY_RADIUS) / distance),
      y: nearest.y + Math.round((dy * BODY_RADIUS) / distance),
    };
    blocked = tile.prop;
  }
  return { offset: { x: clamp(p.x, -HALF, HALF), y: clamp(p.y, -HALF, HALF) }, blocked };
};

const direct = (session: Session, { kind, direction }: Action): Session => {
  const turned = direction !== session.facing;
  const climb = turned ? undefined : session.climb;
  if (kind === "face") return { ...session, facing: direction, drive: 0, climb, blocked: undefined };
  const drive = kind === "step" ? STEP_TICKS : Math.max(session.drive, 1);
  return { ...session, facing: direction, drive, climb, blocked: undefined };
};

const exert = (session: Session, layers: Layers, coasting: boolean): Session => {
  const { position, offset, layer, facing, drive, climb } = session;
  if (drive === 0) return session;
  const { axis, sign } = axisOf(facing);
  const along = offset[axis] * sign;
  const withAlong = (value: number): Vec2 => ({ ...offset, [axis]: value * sign + 0 });
  const here = layers.terrainOn(layer)(position.x, position.y);
  const ahead = neighbourOf(session, layers, facing);
  const edgeAhead = edgeBetween(here, ahead.tile);

  if (edgeAhead.climb && along === HALF) {
    const spent = (climb?.spent ?? 0) + 1;
    return spent < edgeAhead.ticks
      ? { ...session, drive: drive - 1, climb: { to: ahead.at, layer: ahead.layer, spent, ticks: edgeAhead.ticks } }
      : {
          ...session,
          drive: drive - 1,
          position: ahead.at,
          layer: ahead.layer,
          offset: withAlong(-HALF),
          climb: undefined,
        };
  }

  const nearEdge = along < 0 ? edgeBetween(neighbourOf(session, layers, OPPOSITE[facing]).tile, here) : edgeAhead;
  const speed = unitsPerTick(here, nearEdge.climb ? 1 : nearEdge.pace);
  const toCentre = along < 0 ? -along : TILE_UNITS - along;
  const reach = Math.min(speed, edgeAhead.climb ? HALF - along : Infinity);
  const arrives = coasting && reach >= toCentre;
  const moved = along + (arrives ? toCentre : reach);
  const crossed = moved > HALF;
  const stepped: Session = crossed
    ? { ...session, position: ahead.at, layer: ahead.layer, offset: withAlong(moved - TILE_UNITS) }
    : { ...session, offset: withAlong(moved) };
  const { offset: settled, blocked } = collide(stepped, layers, stepped.offset);
  return { ...stepped, offset: settled, blocked, drive: arrives ? 0 : drive - 1, climb: undefined };
};

export const playTick = (session: Session, layers: Layers, action: Action | undefined): Session =>
  exert({ ...(action ? direct(session, action) : session), tick: session.tick + 1 }, layers, action?.kind !== "push");
