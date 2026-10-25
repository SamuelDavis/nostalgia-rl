import { type Vec2, clamp } from "procgen";
import { type Layer, type Prop, SURFACE } from "../worldgen";
import {
  BODY_RADIUS,
  Direction,
  Heading,
  STEP_TICKS,
  TILE_UNITS,
  edgeBetween,
  isImpassable,
  axesOf,
  lengthOf,
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
  readonly facing: Heading;
  readonly drive: number;
  readonly goal: Vec2 | undefined;
  readonly climb: Climb | undefined;
  readonly blocked: Prop | undefined;
}

export interface Action {
  readonly kind: "face" | "step" | "push";
  readonly heading: Heading;
}

export const startSession = (position: Vec2): Session => ({
  tick: 0,
  position,
  offset: { x: 0, y: 0 },
  layer: SURFACE,
  facing: Heading.South,
  drive: 0,
  goal: undefined,
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

const nextCentres = ({ position, offset }: Session, heading: Heading): Vec2 =>
  axesOf(heading).reduce((goal, direction) => {
    const { axis, sign } = axisOf(direction);
    return { ...goal, [axis]: position[axis] + (offset[axis] * sign < 0 ? 0 : sign) };
  }, position);

const direct = (session: Session, { kind, heading }: Action): Session => {
  const climb = heading === session.facing ? session.climb : undefined;
  const turned = { ...session, facing: heading, climb, blocked: undefined };
  if (kind === "face") return { ...turned, drive: 0, goal: undefined };
  if (kind === "push") return { ...turned, drive: 1, goal: undefined };
  return { ...turned, drive: Math.ceil(STEP_TICKS * lengthOf(heading)), goal: nextCentres(session, heading) };
};

const stepAlong = (
  session: Session,
  layers: Layers,
  direction: Direction,
  share: number,
  mayClimb: boolean,
): Session => {
  const { position, offset, layer, climb, goal } = session;
  const { axis, sign } = axisOf(direction);
  const along = offset[axis] * sign;
  const toGoal = goal ? (goal[axis] - position[axis]) * sign * TILE_UNITS - along : Infinity;
  if (toGoal <= 0) return session;
  const withAlong = (value: number): Vec2 => ({ ...offset, [axis]: value * sign + 0 });
  const here = layers.terrainOn(layer)(position.x, position.y);
  const ahead = neighbourOf(session, layers, direction);
  const edgeAhead = edgeBetween(here, ahead.tile);

  if (edgeAhead.climb && along === HALF) {
    if (!mayClimb) return session;
    const spent = (climb?.spent ?? 0) + 1;
    return spent < edgeAhead.ticks
      ? { ...session, climb: { to: ahead.at, layer: ahead.layer, spent, ticks: edgeAhead.ticks } }
      : { ...session, position: ahead.at, layer: ahead.layer, offset: withAlong(-HALF), climb: undefined };
  }

  const nearEdge = along < 0 ? edgeBetween(neighbourOf(session, layers, OPPOSITE[direction]).tile, here) : edgeAhead;
  const speed = Math.round(unitsPerTick(here, nearEdge.climb ? 1 : nearEdge.pace) * share);
  const moved = along + Math.min(speed, edgeAhead.climb ? HALF - along : Infinity, toGoal);
  return moved > HALF
    ? { ...session, position: ahead.at, layer: ahead.layer, offset: withAlong(moved - TILE_UNITS), climb: undefined }
    : { ...session, offset: withAlong(moved), climb: undefined };
};

const exert = (session: Session, layers: Layers): Session => {
  if (session.drive === 0) return session;
  const axes = axesOf(session.facing);
  const share = 1 / lengthOf(session.facing);
  const stepped = axes.reduce((s, direction) => stepAlong(s, layers, direction, share, axes.length === 1), session);
  const { offset, blocked } = collide(stepped, layers, stepped.offset);
  const { position, goal } = stepped;
  const arrived =
    goal !== undefined &&
    axes.every((direction) => {
      const { axis } = axisOf(direction);
      return position[axis] === goal[axis] && offset[axis] === 0;
    });
  const drive = arrived ? 0 : session.drive - 1;
  return { ...stepped, offset, blocked, drive, goal: drive === 0 ? undefined : goal };
};

export const playTick = (session: Session, layers: Layers, action: Action | undefined): Session =>
  exert({ ...(action ? direct(session, action) : session), tick: session.tick + 1 }, layers);
