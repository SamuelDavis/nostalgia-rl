import { Direction, TILE_UNITS, standingHeight } from "../game/movement";
import type { Ticks } from "../game/play";
import type { Session } from "../game/session";
import type { Layers } from "../game/terrain";
import type { Layer } from "../worldgen";
import { type Vec2, clamp, hash, lerp, mod, unit } from "procgen";

const EYE_EASING_MS = 300;
const TURN_EASING_MS = 60;
const SWAY_EASING_MS = 80;
const STRIDE = 0.5;
const STRIDE_VARIANCE = 0.2;

const strideOn = ({ x, y }: Vec2) => STRIDE + STRIDE_VARIANCE * (2 * unit(hash(x, y)) - 1);

export const footstep = (coordinate: number, stride: number): number =>
  coordinate - (stride * Math.sin(2 * Math.PI * coordinate)) / (2 * Math.PI);

const between = (from: Vec2, to: Vec2, t: number): Vec2 => ({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });

export const shownOf = ({ position, offset }: Session): Vec2 => ({
  x: position.x + offset.x / TILE_UNITS,
  y: position.y + offset.y / TILE_UNITS,
});

const QUARTER_TURNS_FROM_EAST: Record<Direction, number> = {
  [Direction.East]: 0,
  [Direction.South]: 1,
  [Direction.West]: 2,
  [Direction.North]: 3,
};

export const facingAngle = (facing: Direction): number => (QUARTER_TURNS_FROM_EAST[facing] * Math.PI) / 2;

export const turnToward = (angle: number, target: number, elapsedMs: number, easingMs: number): number => {
  const shortest = mod(target - angle + Math.PI, 2 * Math.PI) - Math.PI;
  return angle + shortest * (1 - Math.exp(-elapsedMs / easingMs));
};

export const approach = (current: number, target: number, elapsedMs: number, easingMs: number): number =>
  target + (current - target) * Math.exp(-elapsedMs / easingMs);

export interface Pose {
  readonly shown: Vec2;
  readonly angle: number;
  readonly eyeLevel: number;
}

const standingOn = (layers: Layers, layer: Layer, { x, y }: Vec2) => standingHeight(layers.terrainOn(layer)(x, y));

const levelOf = ({ position, layer, climb }: Session, layers: Layers): number => {
  const here = standingOn(layers, layer, position);
  return climb ? lerp(here, standingOn(layers, climb.layer, climb.to), climb.spent / climb.ticks) : here;
};

export const createMotion = (tickMs: number, start: Session, layers: Layers, now: number) => {
  let latest: Pick<Ticks, "prior" | "session" | "scheduled"> = { prior: start, session: start, scheduled: now };
  let angle = facingAngle(start.facing);
  let eyeLevel = levelOf(start, layers);
  let sway: Vec2 = { x: 0, y: 0 };
  let lastFrame = now;
  return {
    ticked: (ticks: Ticks) => {
      latest = ticks;
    },
    poseAt: (now: number): Pose => {
      const elapsed = now - lastFrame;
      lastFrame = now;
      const { prior, session, scheduled } = latest;
      const t = clamp((now - scheduled) / tickMs, 0, 1);
      angle = turnToward(angle, facingAngle(session.facing), elapsed, TURN_EASING_MS);
      eyeLevel = approach(eyeLevel, lerp(levelOf(prior, layers), levelOf(session, layers), t), elapsed, EYE_EASING_MS);
      const [from, to] = [shownOf(prior), shownOf(session)];
      const at = between(from, to, t);
      const swayOn = (axis: "x" | "y") =>
        approach(sway[axis], from[axis] === to[axis] ? 0 : 1, elapsed, SWAY_EASING_MS);
      sway = { x: swayOn("x"), y: swayOn("y") };
      const stride = strideOn(session.position);
      const stepped = (axis: "x" | "y") => lerp(at[axis], footstep(at[axis], stride), sway[axis]);
      return { shown: { x: stepped("x"), y: stepped("y") }, angle, eyeLevel };
    },
  };
};
