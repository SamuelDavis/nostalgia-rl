import { Heading, TILE_UNITS, standingHeight } from "../game/movement";
import type { Ticks } from "../game/play";
import type { Session } from "../game/session";
import type { Layers } from "../game/terrain";
import type { Layer } from "../worldgen";
import { type Vec2, clamp, hash, lerp, mod, unit } from "procgen";

const EYE_EASING_MS = 300;
const TURN_EASING_MS = 60;
const SWAY_EASING_MS = 80;
const STRIDE = 0.5;
const STRIDE_VARIANCE = 0.2;
const SIDESTEP = 0.03;
export const STEP_LENGTH = 2;

const strideOn = ({ x, y }: Vec2) => STRIDE + STRIDE_VARIANCE * (2 * unit(hash(x, y)) - 1);

export const footstep = (coordinate: number, stride: number): number =>
  coordinate - (stride * Math.sin(2 * Math.PI * coordinate)) / (2 * Math.PI);

export const gait = (walked: number, stride: number) => {
  const steps = walked / STEP_LENGTH;
  return {
    along: STEP_LENGTH * (footstep(steps, stride) - steps),
    across: SIDESTEP * Math.cos(Math.PI * steps),
  };
};

const between = (from: Vec2, to: Vec2, t: number): Vec2 => ({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });

export const shownOf = ({ position, offset }: Session): Vec2 => ({
  x: position.x + offset.x / TILE_UNITS,
  y: position.y + offset.y / TILE_UNITS,
});

export const facingAngle = (facing: Heading): number => (mod(facing - Heading.East, 8) * Math.PI) / 4;

export const turnToward = (angle: number, target: number, elapsedMs: number, easingMs: number): number => {
  const shortest = mod(target - angle + Math.PI, 2 * Math.PI) - Math.PI;
  return angle + shortest * (1 - Math.exp(-elapsedMs / easingMs));
};

export const approach = (current: number, target: number, elapsedMs: number, easingMs: number): number =>
  target + (current - target) * Math.exp(-elapsedMs / easingMs);

export interface Pose {
  readonly shown: Vec2;
  readonly angle: number;
  readonly eyeLevel: number;
}

const standingOn = (layers: Layers, layer: Layer, { x, y }: Vec2) => standingHeight(layers.terrainOn(layer)(x, y));

const levelOf = ({ position, layer, climb }: Session, layers: Layers): number => {
  const here = standingOn(layers, layer, position);
  return climb ? lerp(here, standingOn(layers, climb.layer, climb.to), climb.spent / climb.ticks) : here;
};

export const createMotion = (tickMs: number, start: Session, layers: Layers, now: number) => {
  let latest: Pick<Ticks, "prior" | "session" | "scheduled"> = { prior: start, session: start, scheduled: now };
  let angle = facingAngle(start.facing);
  let eyeLevel = levelOf(start, layers);
  let sway = 0;
  let walked = 0;
  let lastAt = shownOf(start);
  let way: Vec2 = { x: 1, y: 0 };
  let lastFrame = now;
  return {
    ticked: (ticks: Ticks) => {
      latest = ticks;
    },
    poseAt: (now: number): Pose => {
      const elapsed = now - lastFrame;
      lastFrame = now;
      const { prior, session, scheduled } = latest;
      const t = clamp((now - scheduled) / tickMs, 0, 1);
      angle = turnToward(angle, facingAngle(session.facing), elapsed, TURN_EASING_MS);
      eyeLevel = approach(eyeLevel, lerp(levelOf(prior, layers), levelOf(session, layers), t), elapsed, EYE_EASING_MS);
      const [from, to] = [shownOf(prior), shownOf(session)];
      const at = between(from, to, t);
      const travel = Math.hypot(to.x - from.x, to.y - from.y);
      if (travel > 0) way = { x: (to.x - from.x) / travel, y: (to.y - from.y) / travel };
      walked += Math.hypot(at.x - lastAt.x, at.y - lastAt.y);
      lastAt = at;
      sway = approach(sway, travel > 0 ? 1 : 0, elapsed, SWAY_EASING_MS);
      const { along, across } = gait(walked, strideOn(session.position));
      const shown = {
        x: at.x + sway * (way.x * along - way.y * across),
        y: at.y + sway * (way.y * along + way.x * across),
      };
      return { shown, angle, eyeLevel };
    },
  };
};
