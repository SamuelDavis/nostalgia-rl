import { type Vec2, distance } from "procgen";
import { PROPS, metresToLevels } from "../worldgen";
import { blockerBetween } from "./movement";
import type { Terrain } from "./terrain";

const EYE_HEIGHT = metresToLevels(1.5);
const SIGHT_STEP = 0.25;

export const clearSight = (terrain: Terrain, from: Vec2, direction: Vec2, reach: number): number => {
  const eye = terrain(from.x, from.y).height + EYE_HEIGHT;
  const blocks = (here: Vec2, there: Vec2) => {
    const [near, far] = [terrain(here.x, here.y), terrain(there.x, there.y)];
    const blocker = blockerBetween(near, far);
    const top = far.height + (blocker === "obstacle" ? PROPS[far.prop].height : 0);
    return blocker !== undefined && top >= eye;
  };
  let last = from;
  for (let t = SIGHT_STEP; t <= reach; t += SIGHT_STEP) {
    const at = { x: Math.floor(from.x + 0.5 + direction.x * t), y: Math.floor(from.y + 0.5 + direction.y * t) };
    if (at.x === last.x && at.y === last.y) continue;
    const isCorner = at.x !== last.x && at.y !== last.y;
    const throughCorner = isCorner && blocks(last, { x: at.x, y: last.y }) && blocks(last, { x: last.x, y: at.y });
    if (blocks(last, at) || throughCorner) return distance(last, from);
    last = at;
  }
  return reach;
};
