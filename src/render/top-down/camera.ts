import { type SightLine, lineOfSight } from "../../game/sight";
import type { Terrain } from "../../game/terrain";
import { type Vec2, clamp } from "procgen";
import { metresToLevels } from "../../worldgen";
import { type Spring, springToward } from "../motion";

export interface Extent {
  readonly width: number;
  readonly height: number;
}

export interface View {
  readonly centre: Vec2;
  readonly tilePx: number;
  readonly restingTilePx: number;
}

export const SIGHT_REACH = 24;
export const OPEN_SPAN = 24;
export const NOSE_SPAN = 5;
const LOOKOUT_REACH = 64;
const LOOKOUT_SPAN = 64;
const LOOKOUT_DROP = metresToLevels(12);
const LINE_COUNT = 48;
const LINE_CENTROID = 2 / 3;
const MAX_LEAD = 0.6;
const FOLLOW_MS = 80;
const LEAD_MS = 450;
const ZOOM_IN_MS = 250;
const ZOOM_OUT_MS = 800;
const RESTING_PX_TOLERANCE = 0.01;
const MIN_SPAN = 4;
const MAX_SPAN = 160;

const DIRECTIONS: readonly Vec2[] = Array.from({ length: LINE_COUNT }, (_, i) => ({
  x: Math.cos((2 * Math.PI * i) / LINE_COUNT),
  y: Math.sin((2 * Math.PI * i) / LINE_COUNT),
}));

export type Survey = readonly SightLine[];

export const surveyFrom = (terrain: Terrain, tile: Vec2): Survey =>
  DIRECTIONS.map((direction) => lineOfSight(terrain, tile, direction, LOOKOUT_REACH));

const seenAlong = ({ clear, drop }: SightLine): number =>
  Math.min(clear, SIGHT_REACH + (LOOKOUT_REACH - SIGHT_REACH) * clamp(drop / LOOKOUT_DROP, 0, 1));

const frontWeight = (direction: Vec2, facing: number): number =>
  Math.max(0, direction.x * Math.cos(facing) + direction.y * Math.sin(facing)) ** 2;

const weighted = (survey: Survey, facing: number, of: (line: SightLine, direction: Vec2) => number): number => {
  let total = 0;
  let weights = 0;
  survey.forEach((line, i) => {
    const weight = frontWeight(DIRECTIONS[i]!, facing);
    total += weight * of(line, DIRECTIONS[i]!);
    weights += weight;
  });
  return total / weights;
};

export const sightRange = (survey: Survey, facing: number): number =>
  Math.min(1 / weighted(survey, facing, (line) => line.obscurity) - 1, weighted(survey, facing, seenAlong));

const logLerp = (from: number, to: number, t: number): number => from * (to / from) ** clamp(t, 0, 1);

export const spanFor = (sight: number): number =>
  sight <= SIGHT_REACH
    ? logLerp(NOSE_SPAN, OPEN_SPAN, Math.log(sight) / Math.log(SIGHT_REACH))
    : logLerp(OPEN_SPAN, LOOKOUT_SPAN, Math.log(sight / SIGHT_REACH) / Math.log(LOOKOUT_REACH / SIGHT_REACH));

const centroidOf = (survey: Survey, facing: number): Vec2 => ({
  x: weighted(survey, facing, (line, d) => LINE_CENTROID * seenAlong(line) * d.x),
  y: weighted(survey, facing, (line, d) => LINE_CENTROID * seenAlong(line) * d.y),
});

export const leadOf = (survey: Survey, facing: number): Vec2 => {
  const centroid = centroidOf(survey, facing);
  const reach = Math.min(1, sightRange(survey, facing) / Math.hypot(centroid.x, centroid.y));
  return { x: centroid.x * reach, y: centroid.y * reach };
};

export const spanOf = (span: number, modifier: number): number => clamp(span + modifier, MIN_SPAN, MAX_SPAN);

export const modifierWithin = (span: number, modifier: number): number =>
  clamp(modifier, MIN_SPAN - span, MAX_SPAN - span);

interface Subject {
  readonly position: Vec2;
  readonly lead: Vec2;
  readonly span: number;
}

const AT_REST = (value: number): Spring => ({ value, velocity: 0 });

export const createCamera = () => {
  let current: { x: Spring; y: Spring; leadX: Spring; leadY: Spring; zoom: Spring } | undefined;
  return ({ position, lead, span }: Subject, screen: Extent, elapsedMs: number): View => {
    const restingTilePx = Math.max(1, Math.round(Math.min(screen.width, screen.height) / span));
    const reach = (extent: number) => (MAX_LEAD * extent) / 2 / restingTilePx;
    const target = {
      x: position.x + 0.5,
      y: position.y + 0.5,
      leadX: clamp(lead.x, -reach(screen.width), reach(screen.width)),
      leadY: clamp(lead.y, -reach(screen.height), reach(screen.height)),
      zoom: Math.log(restingTilePx),
    };
    const was = current ?? {
      x: AT_REST(target.x),
      y: AT_REST(target.y),
      leadX: AT_REST(target.leadX),
      leadY: AT_REST(target.leadY),
      zoom: AT_REST(target.zoom),
    };
    const zoomMs = target.zoom > was.zoom.value ? ZOOM_IN_MS : ZOOM_OUT_MS;
    const zoom = springToward(was.zoom, target.zoom, elapsedMs, zoomMs);
    const isResting = Math.abs(Math.exp(zoom.value) - restingTilePx) < RESTING_PX_TOLERANCE;
    current = {
      x: springToward(was.x, target.x, elapsedMs, FOLLOW_MS),
      y: springToward(was.y, target.y, elapsedMs, FOLLOW_MS),
      leadX: springToward(was.leadX, target.leadX, elapsedMs, LEAD_MS),
      leadY: springToward(was.leadY, target.leadY, elapsedMs, LEAD_MS),
      zoom: isResting ? AT_REST(target.zoom) : zoom,
    };
    return {
      centre: { x: current.x.value + current.leadX.value, y: current.y.value + current.leadY.value },
      tilePx: isResting ? restingTilePx : Math.exp(current.zoom.value),
      restingTilePx,
    };
  };
};
