import { Direction } from "../game/movement";
import type { Ticks } from "../game/play";
import type { Session } from "../game/session";
import type { Layers } from "../game/terrain";
import type { Layer } from "../worldgen";
import { type Vec2, clamp, hash, lerp, mod, unit } from "procgen";

const EYE_EASING_MS = 300;
const TURN_EASING_MS = 60;
const STRIDE = 0.5;
const STRIDE_VARIANCE = 0.2;

const strideTo = ({ x, y }: Vec2) => STRIDE + STRIDE_VARIANCE * (2 * unit(hash(x, y)) - 1);

const footstep = (progress: number, stride: number): number =>
  progress - (stride * Math.sin(2 * Math.PI * progress)) / (2 * Math.PI);

const between = (from: Vec2, to: Vec2, t: number): Vec2 => ({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });

export const shownOf = ({ position, stride }: Session): Vec2 =>
  stride ? between(position, stride.to, footstep(stride.spent / stride.ticks, strideTo(stride.to))) : position;

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

const heightOn = (layers: Layers, layer: Layer, { x, y }: Vec2) => layers.terrainOn(layer)(x, y).height;

const levelOf = ({ position, layer, stride }: Session, layers: Layers): number => {
  const here = heightOn(layers, layer, position);
  return stride ? lerp(here, heightOn(layers, stride.layer, stride.to), stride.spent / stride.ticks) : here;
};

export const createMotion = (tickMs: number, start: Session, layers: Layers, now: number) => {
  let latest: Pick<Ticks, "prior" | "session" | "scheduled"> = { prior: start, session: start, scheduled: now };
  let angle = facingAngle(start.facing);
  let eyeLevel = levelOf(start, layers);
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
      const level = lerp(levelOf(prior, layers), levelOf(session, layers), t);
      eyeLevel = approach(eyeLevel, level, elapsed, EYE_EASING_MS);
      return { shown: between(shownOf(prior), shownOf(session), t), angle, eyeLevel };
    },
  };
};
