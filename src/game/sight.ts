import { type Vec2, clamp } from "procgen";
import { PROPS, metresToLevels } from "../worldgen";
import { standingHeight } from "./movement";
import type { Terrain, Tile } from "./terrain";

const EYE_HEIGHT = metresToLevels(1.5);
const SIGHT_STEP = 0.25;
const SHORT_OPACITY = 0.2;

export interface SightLine {
  readonly clear: number;
  readonly obscurity: number;
  readonly drop: number;
}

const topOf = (tile: Tile): number => tile.height + PROPS[tile.prop].height;

export const lineOfSight = (terrain: Terrain, from: Vec2, direction: Vec2, reach: number): SightLine => {
  const feet = standingHeight(terrain(from.x, from.y));
  const opacityAt = (x: number, y: number) => {
    const rise = (topOf(terrain(x, y)) - feet) / EYE_HEIGHT;
    return rise >= 1 ? 1 : SHORT_OPACITY * clamp(rise, 0, 1);
  };
  let obscurity = 0;
  let fallen = 0;
  let crossed = 0;
  const seen = (clear: number): SightLine => ({ clear, obscurity, drop: crossed && fallen / crossed });
  let last = from;
  for (let t = SIGHT_STEP; t <= reach; t += SIGHT_STEP) {
    const at = { x: Math.floor(from.x + 0.5 + direction.x * t), y: Math.floor(from.y + 0.5 + direction.y * t) };
    if (at.x === last.x && at.y === last.y) continue;
    const isCorner = at.x !== last.x && at.y !== last.y;
    const corner = isCorner ? Math.min(opacityAt(at.x, last.y), opacityAt(last.x, at.y)) : 0;
    const opacity = Math.max(opacityAt(at.x, at.y), corner);
    obscurity = Math.max(obscurity, opacity / (1 + t));
    if (opacity === 1) return seen(t);
    fallen += Math.max(0, feet - terrain(at.x, at.y).height);
    crossed++;
    last = at;
  }
  return seen(reach);
};
