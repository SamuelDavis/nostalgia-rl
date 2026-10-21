import type { Vec2 } from "procgen";
import { Prop, MAX_CLIMB, Water, Way } from "../worldgen";

export const Direction = { North: 0, East: 1, South: 2, West: 3 } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

const OFFSETS: Record<Direction, Vec2> = {
  [Direction.North]: { x: 0, y: -1 },
  [Direction.East]: { x: 1, y: 0 },
  [Direction.South]: { x: 0, y: 1 },
  [Direction.West]: { x: -1, y: 0 },
};

export const stepToward = (p: Vec2, direction: Direction): Vec2 => ({
  x: p.x + OFFSETS[direction].x,
  y: p.y + OFFSETS[direction].y,
});

export type Blocker = "cliff" | "obstacle";

interface Footing {
  readonly height: number;
  readonly way: Way;
  readonly water: Water;
  readonly prop: Prop;
}

const SOLID: ReadonlySet<Prop> = new Set([
  Prop.Oak,
  Prop.Pine,
  Prop.Cactus,
  Prop.Boulder,
  Prop.Tent,
  Prop.Campfire,
  Prop.Rock,
  Prop.Stalagmite,
  Prop.CaveMouth,
  Prop.MineEntrance,
  Prop.Shed,
  Prop.Stockpile,
  Prop.Bunkhouse,
]);

export const isTrail = ({ way }: Footing): boolean => way !== Way.None;

export const isStairs = (from: Footing, to: Footing): boolean =>
  Math.abs(to.height - from.height) > MAX_CLIMB && isTrail(from) && isTrail(to);

export const isCliff = (from: Footing, to: Footing): boolean =>
  Math.abs(to.height - from.height) > MAX_CLIMB && !isStairs(from, to);

export const isSwimming = ({ water, prop }: Footing): boolean => water === Water.Deep && prop !== Prop.Bridge;

export const blockerBetween = (from: Footing, to: Footing): Blocker | undefined => {
  if (SOLID.has(to.prop)) return "obstacle";
  if (isCliff(from, to)) return "cliff";
  return undefined;
};
