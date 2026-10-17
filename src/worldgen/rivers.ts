import { type Point, distance, projectOntoSegment, createNoise, hash, hashString, intBetween, unit } from "../lib";
import { REGION_SIZE, MAX_CLIMB, SEA_LEVEL, heightLevel } from "./constants";
import type { Fields } from "./fields";

export interface RiverNode extends Point {
  readonly level: number;
  readonly halfWidth: number;
}

export interface Lake extends Point {
  readonly radius: number;
  readonly level: number;
}

export interface River {
  readonly nodes: readonly RiverNode[];
  readonly lake?: Lake;
}

const SALT = hashString("rivers");
const SOURCE_CHANCE = 0.7;
const MIN_SOURCE_LEVEL = heightLevel(0.42);
const STEP = 4;
const MAX_DESCENT = (MAX_CLIMB / 2) * STEP;
const MAX_STEPS = 300;
const STAGNATION_STEPS = 40;
const GRADIENT_SPAN = 20;
const STEPS_PER_WIDTH = 45;
const MAX_HALF_WIDTH = 3;
const MARGIN = 24;

const LOOP_GAP = 6;
const LOOP_DISTANCE = 6;

const loopsBack = (nodes: readonly RiverNode[]): boolean => {
  const head = nodes.at(-1)!;
  return nodes
    .slice(0, -LOOP_GAP)
    .some((node) => Math.abs(node.x - head.x) < LOOP_DISTANCE && Math.abs(node.y - head.y) < LOOP_DISTANCE);
};

export const MAX_RIVER_REACH = STEP * MAX_STEPS;

const normalize = (x: number, y: number): Point => {
  const length = Math.sqrt(x * x + y * y);
  return length === 0 ? { x: 0, y: 0 } : { x: x / length, y: y / length };
};

const downhill = ({ drainage }: Fields, p: Point): Point =>
  normalize(
    drainage(p.x - GRADIENT_SPAN, p.y) - drainage(p.x + GRADIENT_SPAN, p.y),
    drainage(p.x, p.y - GRADIENT_SPAN) - drainage(p.x, p.y + GRADIENT_SPAN),
  );

const sourceOf = (seed: number, cx: number, cy: number): Point | undefined => {
  if (unit(hash(seed, SALT, cx, cy)) > SOURCE_CHANCE) return undefined;
  return {
    x: cx * REGION_SIZE + intBetween(MARGIN, REGION_SIZE - MARGIN, hash(seed, SALT, cx, cy, 1)),
    y: cy * REGION_SIZE + intBetween(MARGIN, REGION_SIZE - MARGIN, hash(seed, SALT, cx, cy, 2)),
  };
};

export const traceRiver = (seed: number, fields: Fields, cx: number, cy: number): River | undefined => {
  const source = sourceOf(seed, cx, cy);
  if (!source) return undefined;
  const sourceLevel = heightLevel(fields.elevation(source.x, source.y));
  if (sourceLevel < MIN_SOURCE_LEVEL) return undefined;

  const meander = createNoise(seed, SALT);
  const nodes: RiverNode[] = [{ ...source, level: sourceLevel, halfWidth: 1 }];
  let position = source;
  let heading = downhill(fields, source);
  let lowest = fields.drainage(source.x, source.y);
  let lowestIndex = 0;

  for (let step = 1; step <= MAX_STEPS; step++) {
    const slope = downhill(fields, position);
    const sway = meander(position.x / 90, position.y / 90) * 0.6;
    heading = normalize(
      heading.x * 0.6 + (slope.x - heading.y * sway) * 0.4,
      heading.y * 0.6 + (slope.y + heading.x * sway) * 0.4,
    );
    position = {
      x: position.x + heading.x * STEP,
      y: position.y + heading.y * STEP,
    };

    const elevation = fields.elevation(position.x, position.y);
    const previous = nodes.at(-1)!.level;
    const level = Math.max(previous - MAX_DESCENT, Math.min(previous, heightLevel(elevation)));
    const halfWidth = Math.min(MAX_HALF_WIDTH, 1 + Math.floor(step / STEPS_PER_WIDTH));
    nodes.push({ ...position, level, halfWidth });

    if (heightLevel(elevation) < SEA_LEVEL) return { nodes };
    if (loopsBack(nodes)) {
      lowestIndex = Math.min(lowestIndex, nodes.length - LOOP_GAP);
      break;
    }
    const drainage = fields.drainage(position.x, position.y);
    if (drainage < lowest) {
      lowest = drainage;
      lowestIndex = step;
    } else if (step - lowestIndex > STAGNATION_STEPS) break;
  }

  const basin = nodes.slice(0, lowestIndex + 1);
  const mouth = basin.at(-1)!;
  return {
    nodes: basin,
    lake: {
      x: mouth.x,
      y: mouth.y,
      level: mouth.level,
      radius: intBetween(5, 12, hash(seed, SALT, cx, cy, 3)),
    },
  };
};

export const distanceToRiver = (river: River, p: Point): number => {
  const lakeGap = river.lake ? distance(p, river.lake) - river.lake.radius : Infinity;
  return river.nodes.reduce((nearest, node, i) => {
    const next = river.nodes[i + 1];
    if (!next) return nearest;
    return Math.min(nearest, projectOntoSegment(p, node, next).distance - next.halfWidth);
  }, lakeGap);
};
