import type { Point } from "../lib";
import { Feature, Ground, MAX_CLIMB, Water } from "../worldgen";

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

export type Blocker = "cliff" | "obstacle";

interface Footing {
  readonly height: number;
  readonly ground: Ground;
  readonly water: Water;
  readonly feature: Feature;
}

const SOLID: ReadonlySet<Feature> = new Set([
  Feature.Oak,
  Feature.Pine,
  Feature.Cactus,
  Feature.Boulder,
  Feature.Tent,
  Feature.Campfire,
]);

export const isTrail = ({ ground, feature }: Footing): boolean =>
  ground === Ground.Road || ground === Ground.Path || feature === Feature.Bridge;

export const isStairs = (from: Footing, to: Footing): boolean =>
  Math.abs(to.height - from.height) > MAX_CLIMB && isTrail(from) && isTrail(to);

export const isCliff = (from: Footing, to: Footing): boolean =>
  Math.abs(to.height - from.height) > MAX_CLIMB && !isStairs(from, to);

export const isSwimming = ({ water, feature }: Footing): boolean => water === Water.Deep && feature !== Feature.Bridge;

export const blockerBetween = (from: Footing, to: Footing): Blocker | undefined => {
  if (SOLID.has(to.feature)) return "obstacle";
  if (isCliff(from, to)) return "cliff";
  return undefined;
};
