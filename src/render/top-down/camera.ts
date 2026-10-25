import { type Direction, stepToward } from "../../game/movement";
import { clearSight } from "../../game/sight";
import type { Terrain } from "../../game/terrain";
import { type Vec2, clamp, lerp } from "procgen";
import { metresToLevels } from "../../worldgen";
import { approach } from "../motion";

export interface Extent {
  readonly width: number;
  readonly height: number;
}

export interface View {
  readonly centre: Vec2;
  readonly tilePx: number;
  readonly restingTilePx: number;
}

const COMPASS: readonly Vec2[] = Array.from({ length: 8 }, (_, i) => ({
  x: Math.cos((i * Math.PI) / 4),
  y: Math.sin((i * Math.PI) / 4),
}));
const SIGHT_RADII = [12, 24] as const;
const SETTLED_SPANS: Spread = { up: 14, level: 20, down: 64 };
const FULL_DROP = metresToLevels(12);
const PRACTICAL_SPANS: Spread = { up: 10, level: 14, down: 20 };
const NOSE_SPAN = 6;
const SPAN_PER_CLEAR_TILE = 2.5;
export const SIGHT_REACH = 24;
const SIGHT_CONE = 90;
const SIGHT_RAY_COUNT = 9;
const HEADING_EASING_MS = 280;
export const SETTLE_MS = 1500;
const LEAD = 0.25;
const LEAN = 0.5;
const MAX_OFFSET = 0.35;
const PAN_EASING_MS = 250;
const ZOOM_EASING_MS = 600;
const RESTING_PX_TOLERANCE = 0.01;
const MIN_SPAN = 4;
const MAX_SPAN = 160;

interface Spread {
  readonly up: number;
  readonly level: number;
  readonly down: number;
}

const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y;
const sum = (values: readonly number[]) => values.reduce((total, v) => total + v, 0);
const mean = (values: readonly number[]) => sum(values) / values.length;

export const openness = (levelAt: (x: number, y: number) => number, at: Vec2): readonly number[] => {
  const eye = levelAt(at.x, at.y);
  return COMPASS.map((d) => {
    const drops = SIGHT_RADII.map((r) => eye - levelAt(at.x + Math.round(d.x * r), at.y + Math.round(d.y * r)));
    return clamp(mean(drops) / FULL_DROP, -1, 1);
  });
};

export const steer = (heading: Vec2, facing: Vec2, elapsedMs: number): Vec2 => ({
  x: approach(heading.x, facing.x, elapsedMs, HEADING_EASING_MS),
  y: approach(heading.y, facing.y, elapsedMs, HEADING_EASING_MS),
});

const opennessAhead = (open: readonly number[], heading: Vec2): number => {
  const weights = COMPASS.map((d) => Math.max(0, dot(d, heading)));
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0) return mean(open);
  const ahead = open.reduce((sum, o, i) => sum + o * weights[i]!, 0) / total;
  return lerp(mean(open), ahead, Math.min(1, Math.hypot(heading.x, heading.y)));
};

const spanAcross = ({ up, level, down }: Spread, ahead: number): number =>
  Math.round(ahead < 0 ? lerp(level, up, -ahead) : lerp(level, down, ahead));

export const naturalSpan = (open: readonly number[], heading: Vec2): number =>
  spanAcross(SETTLED_SPANS, opennessAhead(open, heading));

export const practicalSpan = (open: readonly number[], heading: Vec2): number =>
  spanAcross(PRACTICAL_SPANS, opennessAhead(open, heading));

const SIGHT_RAYS: readonly number[] = Array.from(
  { length: SIGHT_RAY_COUNT },
  (_, i) => ((i / (SIGHT_RAY_COUNT - 1) - 0.5) * SIGHT_CONE * Math.PI) / 180,
);

const rotate = ({ x, y }: Vec2, angle: number): Vec2 => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle),
});

export interface Sight {
  readonly distance: number;
  readonly lead: Vec2;
}

export const sightAhead = (terrain: Terrain, from: Vec2, facing: Direction): Sight => {
  const ahead = stepToward({ x: 0, y: 0 }, facing);
  const lines = SIGHT_RAYS.map((angle) => {
    const direction = rotate(ahead, angle);
    return { direction, clear: clearSight(terrain, from, direction, SIGHT_REACH), weight: Math.cos(2 * angle) };
  });
  const nearness = sum(lines.map(({ clear, weight }) => weight / (1 + clear))) / sum(lines.map(({ weight }) => weight));
  const reach = sum(SIGHT_RAYS.map(Math.cos)) * SIGHT_REACH;
  const lead = {
    x: sum(lines.map(({ direction, clear }) => direction.x * clear)) / reach,
    y: sum(lines.map(({ direction, clear }) => direction.y * clear)) / reach,
  };
  return { distance: 1 / nearness - 1, lead };
};

interface Spans {
  readonly natural: number;
  readonly practical: number;
  readonly sight: number;
}

export const attentiveSpan = ({ natural, practical, sight }: Spans, idleMs: number): number =>
  Math.min(idleMs >= SETTLE_MS ? natural : practical, Math.round(NOSE_SPAN + sight * SPAN_PER_CLEAR_TILE));

export const lookOffset = (open: readonly number[], lead: Vec2): Vec2 => {
  const lean = (axis: "x" | "y") => mean(COMPASS.map((d, i) => d[axis] * open[i]!));
  return {
    x: clamp(lead.x * LEAD + lean("x") * LEAN, -MAX_OFFSET, MAX_OFFSET),
    y: clamp(lead.y * LEAD + lean("y") * LEAN, -MAX_OFFSET, MAX_OFFSET),
  };
};

export const spanOf = (natural: number, modifier: number): number => clamp(natural + modifier, MIN_SPAN, MAX_SPAN);

export const modifierWithin = (natural: number, modifier: number): number =>
  clamp(modifier, MIN_SPAN - natural, MAX_SPAN - natural);

interface Subject {
  readonly position: Vec2;
  readonly look: Vec2;
  readonly span: number;
}

export const createCamera = () => {
  let current: { followed: Vec2; look: Vec2; tilePx: number } | undefined;
  return (subject: Subject, screen: Extent, elapsedMs: number): View => {
    const restingTilePx = Math.max(1, Math.round(Math.min(screen.width, screen.height) / subject.span));
    const easedTilePx = current ? approach(current.tilePx, restingTilePx, elapsedMs, ZOOM_EASING_MS) : restingTilePx;
    const tilePx = Math.abs(easedTilePx - restingTilePx) < RESTING_PX_TOLERANCE ? restingTilePx : easedTilePx;
    const pan = (from: Vec2, to: Vec2): Vec2 =>
      current
        ? { x: approach(from.x, to.x, elapsedMs, PAN_EASING_MS), y: approach(from.y, to.y, elapsedMs, PAN_EASING_MS) }
        : to;
    const followed = pan(current?.followed ?? subject.position, {
      x: subject.position.x + 0.5,
      y: subject.position.y + 0.5,
    });
    const look = pan(current?.look ?? subject.look, subject.look);
    current = { followed, look, tilePx };
    const centre = {
      x: followed.x + (look.x * screen.width) / tilePx,
      y: followed.y + (look.y * screen.height) / tilePx,
    };
    return { centre, tilePx, restingTilePx };
  };
};
