import { type Point, clamp, lerp } from "../lib";
import { type Direction, stepToward } from "../game/movement";
import { metresToLevels } from "../worldgen";

export interface Extent {
  readonly width: number;
  readonly height: number;
}

export interface View {
  readonly centre: Point;
  readonly cellPx: number;
}

const SURROUNDINGS: readonly Point[] = [12, 24].flatMap((radius) =>
  Array.from({ length: 8 }, (_, i) => ({
    x: Math.round(radius * Math.cos((i * Math.PI) / 4)),
    y: Math.round(radius * Math.sin((i * Math.PI) / 4)),
  })),
);
const CLOSE_SPAN = 24;
const FAR_SPAN = 64;
const FULL_PROMINENCE = metresToLevels(12);
const LEAD = 0.25;
const EASING_MS = 250;
const MIN_SPAN = 8;
const MAX_SPAN = 160;

export const prominence = (levelAt: (x: number, y: number) => number, at: Point): number => {
  const surrounding = SURROUNDINGS.reduce((sum, o) => sum + levelAt(at.x + o.x, at.y + o.y), 0);
  return levelAt(at.x, at.y) - surrounding / SURROUNDINGS.length;
};

export const naturalSpan = (prominence: number): number =>
  Math.round(lerp(CLOSE_SPAN, FAR_SPAN, clamp(prominence / FULL_PROMINENCE, 0, 1)));

export const spanOf = (natural: number, modifier: number): number => clamp(natural + modifier, MIN_SPAN, MAX_SPAN);

export const modifierWithin = (natural: number, modifier: number): number =>
  clamp(modifier, MIN_SPAN - natural, MAX_SPAN - natural);

export const leadToward = (facing: Direction, view: Extent): Point => {
  const { x, y } = stepToward({ x: 0, y: 0 }, facing);
  return { x: x * view.width * LEAD, y: y * view.height * LEAD };
};

export const approach = (current: number, target: number, elapsedMs: number): number =>
  target + (current - target) * Math.exp(-elapsedMs / EASING_MS);

interface Subject {
  readonly position: Point;
  readonly facing: Direction;
  readonly span: number;
}

export const createCamera = () => {
  let current: { centre: Point; span: number } | undefined;
  return (subject: Subject, screen: Extent, elapsedMs: number): View => {
    const span = current ? approach(current.span, subject.span, elapsedMs) : subject.span;
    const cellPx = Math.max(1, Math.round(Math.min(screen.width, screen.height) / span));
    const lead = leadToward(subject.facing, { width: screen.width / cellPx, height: screen.height / cellPx });
    const target = { x: subject.position.x + 0.5 + lead.x, y: subject.position.y + 0.5 + lead.y };
    const centre = current
      ? { x: approach(current.centre.x, target.x, elapsedMs), y: approach(current.centre.y, target.y, elapsedMs) }
      : target;
    current = { centre, span };
    return { centre, cellPx };
  };
};
