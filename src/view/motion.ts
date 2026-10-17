import { type Point, clamp, lerp } from "../lib";

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
