import type { Point } from "../lib";
import { Feature, MAX_CLIMB, Water } from "../worldgen";

export const Direction = { North: 0, East: 1, South: 2, West: 3 } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

const OFFSETS: Record<Direction, Point> = {
  [Direction.North]: { x: 0, y: -1 },
  [Direction.East]: { x: 1, y: 0 },
  [Direction.South]: { x: 0, y: 1 },
  [Direction.West]: { x: -1, y: 0 },
};

export const stepToward = (p: Point, direction: Direction): Point => ({
  x: p.x + OFFSETS[direction].x,
  y: p.y + OFFSETS[direction].y,
});

export type Blocker = "cliff" | "deep water";

interface Footing {
  readonly height: number;
  readonly water: Water;
  readonly feature: Feature;
}

export const isCliff = (from: Footing, to: Footing): boolean => Math.abs(to.height - from.height) > MAX_CLIMB;

export const blockerBetween = (from: Footing, to: Footing): Blocker | undefined => {
  if (to.water === Water.Deep && to.feature !== Feature.Bridge) return "deep water";
  if (isCliff(from, to)) return "cliff";
  return undefined;
};
