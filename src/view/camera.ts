import { type Point, clamp, lerp } from "../lib";
import { metresToLevels } from "../worldgen";

export interface Extent {
  readonly width: number;
  readonly height: number;
}

export interface View {
  readonly centre: Point;
  readonly tilePx: number;
  readonly restingTilePx: number;
}

const COMPASS: readonly Point[] = Array.from({ length: 8 }, (_, i) => ({
  x: Math.cos((i * Math.PI) / 4),
  y: Math.sin((i * Math.PI) / 4),
}));
const SIGHT_RADII = [12, 24] as const;
const CLOSE_SPAN = 24;
const FAR_SPAN = 64;
const FULL_DROP = metresToLevels(12);
const STEER = 0.3;
const LEAD = 0.25;
const LEAN = 0.5;
const MAX_OFFSET = 0.35;
const PAN_EASING_MS = 250;
const ZOOM_EASING_MS = 600;
const RESTING_PX_TOLERANCE = 0.01;
const MIN_SPAN = 8;
const MAX_SPAN = 160;

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const mean = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

export const openness = (levelAt: (x: number, y: number) => number, at: Point): readonly number[] => {
  const eye = levelAt(at.x, at.y);
  return COMPASS.map((d) => {
    const drops = SIGHT_RADII.map((r) => eye - levelAt(at.x + Math.round(d.x * r), at.y + Math.round(d.y * r)));
    return clamp(mean(drops) / FULL_DROP, 0, 1);
  });
};

export const steer = (heading: Point, step: Point): Point => ({
  x: lerp(heading.x, step.x, STEER),
  y: lerp(heading.y, step.y, STEER),
});

const opennessAhead = (open: readonly number[], heading: Point): number => {
  const weights = COMPASS.map((d) => Math.max(0, dot(d, heading)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0) return mean(open);
  const ahead = open.reduce((sum, o, i) => sum + o * weights[i]!, 0) / total;
  return lerp(mean(open), ahead, Math.min(1, Math.hypot(heading.x, heading.y)));
};

export const naturalSpan = (open: readonly number[], heading: Point): number =>
  Math.round(lerp(CLOSE_SPAN, FAR_SPAN, opennessAhead(open, heading)));

export const lookOffset = (open: readonly number[], heading: Point): Point => {
  const lean = (axis: "x" | "y") => mean(COMPASS.map((d, i) => d[axis] * open[i]!));
  return {
    x: clamp(heading.x * LEAD + lean("x") * LEAN, -MAX_OFFSET, MAX_OFFSET),
    y: clamp(heading.y * LEAD + lean("y") * LEAN, -MAX_OFFSET, MAX_OFFSET),
  };
};

export const approach = (current: number, target: number, elapsedMs: number, easingMs: number): number =>
  target + (current - target) * Math.exp(-elapsedMs / easingMs);

export const spanOf = (natural: number, modifier: number): number => clamp(natural + modifier, MIN_SPAN, MAX_SPAN);

export const modifierWithin = (natural: number, modifier: number): number =>
  clamp(modifier, MIN_SPAN - natural, MAX_SPAN - natural);

interface Subject {
  readonly position: Point;
  readonly look: Point;
  readonly span: number;
}

export const createCamera = () => {
  let current: { centre: Point; tilePx: number } | undefined;
  return (subject: Subject, screen: Extent, elapsedMs: number): View => {
    const restingTilePx = Math.max(1, Math.round(Math.min(screen.width, screen.height) / subject.span));
    const easedTilePx = current ? approach(current.tilePx, restingTilePx, elapsedMs, ZOOM_EASING_MS) : restingTilePx;
    const tilePx = Math.abs(easedTilePx - restingTilePx) < RESTING_PX_TOLERANCE ? restingTilePx : easedTilePx;
    const target = {
      x: subject.position.x + 0.5 + (subject.look.x * screen.width) / tilePx,
      y: subject.position.y + 0.5 + (subject.look.y * screen.height) / tilePx,
    };
    const pan = (from: number, to: number) => approach(from, to, elapsedMs, PAN_EASING_MS);
    const centre = current ? { x: pan(current.centre.x, target.x), y: pan(current.centre.y, target.y) } : target;
    current = { centre, tilePx };
    return { centre, tilePx, restingTilePx };
  };
};
