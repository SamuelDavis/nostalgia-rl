import { Direction } from "../game/movement";
import { type Point, clamp, hash, lerp, mod, unit } from "../lib";

const STRIDE = 0.5;
const STRIDE_VARIANCE = 0.2;

const strideTo = ({ x, y }: Point) => STRIDE + STRIDE_VARIANCE * (2 * unit(hash(x, y)) - 1);

const footstep = (progress: number, stride: number): number =>
  progress - (stride * Math.sin(2 * Math.PI * progress)) / (2 * Math.PI);

const between = (from: Point, to: Point, progress: number): Point => {
  const t = footstep(clamp(progress, 0, 1), strideTo(to));
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) };
};

export const createGlide = (durationMs: number, start: Point) => {
  let from = start;
  let to = start;
  let startedAt = -Infinity;
  const shownAt = (now: number) => between(from, to, (now - startedAt) / durationMs);
  const moveTo = (target: Point, at: number) => {
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
