import { Direction } from "../game/movement";
import { type Point, clamp, lerp, mod } from "../lib";

const between = (from: Point, to: Point, progress: number): Point => ({
  x: lerp(from.x, to.x, clamp(progress, 0, 1)),
  y: lerp(from.y, to.y, clamp(progress, 0, 1)),
});

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
