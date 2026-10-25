import { Direction } from "../game/movement";
import type { Turn } from "../game/play";
import type { Session } from "../game/session";
import type { Terrain } from "../game/terrain";
import { type Vec2, clamp, hash, lerp, mod, unit } from "procgen";

const EYE_EASING_MS = 300;
const TURN_EASING_MS = 60;
const STRIDE = 0.5;
const STRIDE_VARIANCE = 0.2;

const strideTo = ({ x, y }: Vec2) => STRIDE + STRIDE_VARIANCE * (2 * unit(hash(x, y)) - 1);

const footstep = (progress: number, stride: number): number =>
  progress - (stride * Math.sin(2 * Math.PI * progress)) / (2 * Math.PI);

const between = (from: Vec2, to: Vec2, progress: number): Vec2 => {
  const t = footstep(clamp(progress, 0, 1), strideTo(to));
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
};

export const createGlide = (durationMs: number, start: Vec2) => {
  let from = start;
  let to = start;
  let startedAt = -Infinity;
  const shownAt = (now: number) => between(from, to, (now - startedAt) / durationMs);
  const moveTo = (target: Vec2, at: number) => {
    from = shownAt(at);
    to = target;
    startedAt = at;
  };
  return { shownAt, moveTo };
};

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

const levelUnder = (session: Session, terrain: Terrain) => terrain(session.position.x, session.position.y).height;

export const createMotion = (turnMs: number, start: Session, terrain: Terrain, now: number) => {
  const glide = createGlide(turnMs, start.position);
  let angle = facingAngle(start.facing);
  let eyeLevel = levelUnder(start, terrain);
  let lastFrame = now;
  return {
    turned: ({ session, scheduled, moved }: Turn) => {
      if (moved) glide.moveTo(session.position, scheduled);
    },
    poseAt: (now: number, session: Session, terrain: Terrain): Pose => {
      const elapsed = now - lastFrame;
      lastFrame = now;
      angle = turnToward(angle, facingAngle(session.facing), elapsed, TURN_EASING_MS);
      eyeLevel = approach(eyeLevel, levelUnder(session, terrain), elapsed, EYE_EASING_MS);
      return { shown: glide.shownAt(now), angle, eyeLevel };
    },
  };
};
