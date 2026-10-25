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

export const TILE_UNITS = 1000;
export const BODY_RADIUS = 300;
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

export const isImpassable = ({ prop }: Footing): boolean => PROPS[prop].crossing === "never";

export const standingHeight = ({ height, prop }: Footing): number =>
  height + (PROPS[prop].crossing === "climb" ? PROPS[prop].height : 0);

const groundPace = (on: Going): number => {
  if (isSwimming(on)) return SWIMMING_PACE;
  if (on.water === Water.Shallow) return WADING_PACE;
  if (isTrail(on)) return WAY_PACE[on.way];
  return on.ground === Ground.Snow || on.biome === Biome.Forest ? ROUGH_PACE : 1;
};

export const paceOn = (on: Going): number => groundPace(on) * (PROPS[on.prop].crossing === "push" ? PUSHING_PACE : 1);

export type Edge = { readonly climb: false; readonly pace: number } | { readonly climb: true; readonly ticks: number };

export const edgeBetween = (from: Footing, to: Footing): Edge => {
  const levels = standingHeight(to) - standingHeight(from);
  const rise = levels * METRES_PER_LEVEL;
  if (Math.abs(levels) > MAX_CLIMB && !(isTrail(from) && isTrail(to)))
    return {
      climb: true,
      ticks: Math.round(Math.abs(rise) * (rise > 0 ? CLIMB_UP_TICKS_PER_METRE : CLIMB_DOWN_TICKS_PER_METRE)),
    };
  return { climb: false, pace: 1 + Math.abs(rise) * (rise > 0 ? UPHILL_PACE_PER_METRE : DOWNHILL_PACE_PER_METRE) };
};

export const unitsPerTick = (on: Going, slopePace: number): number =>
  Math.round(TILE_UNITS / (STEP_TICKS * paceOn(on) * slopePace));
