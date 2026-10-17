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
  return (target: Point, now: number): Point => {
    if (target.x !== to.x || target.y !== to.y) {
      from = shownAt(now);
      to = target;
      startedAt = now;
    }
    return shownAt(now);
  };
};
