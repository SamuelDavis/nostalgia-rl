import type { Point } from "../lib";
import { MAX_CLIMB } from "./constants";

export const CAMP_RADIUS = 12;
export const CAMP_YARD = 5;

export const TENT_OFFSETS: readonly Point[] = [
  { x: -4, y: -2 },
  { x: 3, y: -3 },
  { x: 2, y: 4 },
];

const SEAM_REACH = (CAMP_RADIUS - CAMP_YARD) * MAX_CLIMB;

const SEAM_PROBES: readonly Point[] = [
  [13, 0],
  [12, 5],
  [9, 9],
  [5, 12],
].flatMap(([a, b]) => [
  { x: a!, y: b! },
  { x: -b!, y: a! },
  { x: -a!, y: -b! },
  { x: b!, y: -a! },
]);

export const settleTowardCamp = (level: number, campLevel: number, gap: number): number => {
  const slack = Math.ceil(Math.max(0, gap - CAMP_YARD)) * MAX_CLIMB;
  return Math.min(campLevel + slack, Math.max(campLevel - slack, level));
};

export const seamFits = (levelAt: (p: Point) => number, camp: Point): boolean => {
  const campLevel = levelAt(camp);
  return SEAM_PROBES.every((o) => Math.abs(levelAt({ x: camp.x + o.x, y: camp.y + o.y }) - campLevel) <= SEAM_REACH);
};
