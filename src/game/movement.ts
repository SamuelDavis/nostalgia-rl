import type { Vec2 } from "procgen";
import { Biome, Ground, MAX_CLIMB, METRES_PER_LEVEL, PROPS, Prop, Water, Way } from "../worldgen";
import type { Terrain } from "./terrain";

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

export const NEIGHBOURS: readonly Vec2[] = Object.values(OFFSETS);

export type Blocker = "cliff" | "obstacle";

interface Footing {
  readonly height: number;
  readonly way: Way;
  readonly water: Water;
  readonly prop: Prop;
}

interface Going extends Footing {
  readonly ground: Ground;
  readonly biome: Biome;
}

export const isTrail = ({ way }: Footing): boolean => way !== Way.None;

export const isStairs = (from: Footing, to: Footing): boolean =>
  Math.abs(to.height - from.height) > MAX_CLIMB && isTrail(from) && isTrail(to);

export const isStairway = (terrain: Terrain, x: number, y: number): boolean => {
  const tile = terrain(x, y);
  return isTrail(tile) && NEIGHBOURS.some((o) => isStairs(tile, terrain(x + o.x, y + o.y)));
};

export const isCliff = (from: Footing, to: Footing): boolean =>
  Math.abs(to.height - from.height) > MAX_CLIMB && !isStairs(from, to);

export const isSwimming = ({ water, prop }: Footing): boolean => water === Water.Deep && prop !== Prop.Bridge;

export const blockerBetween = (from: Footing, to: Footing): Blocker | undefined => {
  if (PROPS[to.prop].solid) return "obstacle";
  if (isCliff(from, to)) return "cliff";
  return undefined;
};

export const STEP_TICKS = 10;
const WAY_PACE: Record<Way, number> = { [Way.None]: 1, [Way.Path]: 0.85, [Way.Road]: 0.7 };
const ROUGH_PACE = 1.2;
const WADING_PACE = 1.5;
const SWIMMING_PACE = 2.5;
const PUSHING_PACE = 3;
const UPHILL_PACE_PER_METRE = 0.8;
const DOWNHILL_PACE_PER_METRE = 0.2;
const CLIMB_UP_TICKS_PER_METRE = 100;
const CLIMB_DOWN_TICKS_PER_METRE = 40;

const paceOn = (to: Going): number => {
  if (isSwimming(to)) return SWIMMING_PACE;
  if (to.water === Water.Shallow) return WADING_PACE;
  if (isTrail(to)) return WAY_PACE[to.way];
  return to.ground === Ground.Snow || to.biome === Biome.Forest ? ROUGH_PACE : 1;
};

const slopePace = (rise: number): number =>
  1 + Math.abs(rise) * (rise > 0 ? UPHILL_PACE_PER_METRE : DOWNHILL_PACE_PER_METRE);

const climbTicks = (rise: number): number =>
  Math.abs(rise) * (rise > 0 ? CLIMB_UP_TICKS_PER_METRE : CLIMB_DOWN_TICKS_PER_METRE);

export const strideTicks = (from: Going, to: Going): number | undefined => {
  const { crossing, height } = PROPS[to.prop];
  if (crossing === "never") return undefined;
  const rise = (to.height - from.height) * METRES_PER_LEVEL;
  const cliff = isCliff(from, to);
  const pace = paceOn(to) * (crossing === "push" ? PUSHING_PACE : 1) * (cliff ? 1 : slopePace(rise));
  const climb = (cliff ? climbTicks(rise) : 0) + (crossing === "climb" ? climbTicks(height * METRES_PER_LEVEL) : 0);
  return Math.round(STEP_TICKS * pace + climb);
};
