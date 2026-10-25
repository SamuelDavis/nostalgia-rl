import type { Vec2 } from "procgen";
import { type Layer, type Prop, SURFACE } from "../worldgen";
import { Direction, STEP_TICKS, stepToward, strideTicks } from "./movement";
import type { Layers } from "./terrain";

export interface Stride {
  readonly to: Vec2;
  readonly layer: Layer;
  readonly spent: number;
  readonly ticks: number;
}

export interface Session {
  readonly tick: number;
  readonly position: Vec2;
  readonly layer: Layer;
  readonly facing: Direction;
  readonly stride: Stride | undefined;
  readonly drive: number;
  readonly blocked: Prop | undefined;
}

export interface Action {
  readonly kind: "face" | "step" | "push";
  readonly direction: Direction;
}

export const startSession = (position: Vec2): Session => ({
  tick: 0,
  position,
  layer: SURFACE,
  facing: Direction.South,
  stride: undefined,
  drive: 0,
  blocked: undefined,
});

const strideToward = (session: Session, { terrainOn, linkAcross }: Layers, direction: Direction): Session => {
  const { position, layer } = session;
  const to = stepToward(position, direction);
  const beyond = linkAcross(layer, position, to) ?? layer;
  const ahead = terrainOn(beyond)(to.x, to.y);
  const ticks = strideTicks(terrainOn(layer)(position.x, position.y), ahead);
  return ticks === undefined
    ? { ...session, facing: direction, stride: undefined, drive: 0, blocked: ahead.prop }
    : { ...session, facing: direction, stride: { to, layer: beyond, spent: 0, ticks }, blocked: undefined };
};

const direct = (session: Session, layers: Layers, { kind, direction }: Action): Session => {
  if (kind === "face") return { ...session, facing: direction, stride: undefined, drive: 0, blocked: undefined };
  const striding = session.stride && direction === session.facing ? session : strideToward(session, layers, direction);
  const { stride, drive } = striding;
  if (!stride) return striding;
  const owed = kind === "step" ? Math.min(STEP_TICKS, stride.ticks - stride.spent) : 1;
  return { ...striding, drive: Math.max(drive, owed) };
};

const exert = (session: Session): Session => {
  const { stride, drive } = session;
  if (!stride || drive === 0) return session;
  const spent = stride.spent + 1;
  return spent < stride.ticks
    ? { ...session, stride: { ...stride, spent }, drive: drive - 1 }
    : { ...session, position: stride.to, layer: stride.layer, stride: undefined, drive: drive - 1 };
};

export const playTick = (session: Session, layers: Layers, action: Action | undefined): Session =>
  exert({ ...(action ? direct(session, layers, action) : session), tick: session.tick + 1 });
