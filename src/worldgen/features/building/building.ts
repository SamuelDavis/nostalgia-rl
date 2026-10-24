import { type Bounds, type Vec2, boundsOf } from "procgen";
import { Cover, Ground, Prop, Water, Way } from "../../terrain";
import type { TileDraft } from "../feature";
import { type Frame, lateralOf, toLocal, toWorld } from "../frame";
import { type Plan, cellOf } from "./plan";
import { levelOf } from "./storeys";

export interface Building {
  readonly plan: Plan;
  readonly frame: Frame;
  readonly level: number;
  readonly bounds: Bounds;
  readonly door: Vec2;
  readonly path: readonly Vec2[];
  readonly roof: Cover;
}

export interface Siting {
  readonly plan: Plan;
  readonly door: Vec2;
  readonly facing: Vec2;
}

export const frameOf = ({ plan, door, facing }: Siting): Frame => {
  const forward = { x: -facing.x, y: -facing.y };
  const lateral = lateralOf(forward);
  return { origin: { x: door.x - lateral.x * plan.doors[0]!, y: door.y - lateral.y * plan.doors[0]! }, forward };
};

export const footprintOf = ({ plan, frame }: Pick<Building, "plan" | "frame">): Vec2[] =>
  Array.from({ length: plan.width * plan.depth }, (_, i) => toWorld(frame, i % plan.width, Math.floor(i / plan.width)));

export const boundsOfBuilding = (building: Pick<Building, "plan" | "frame">): Bounds => boundsOf(footprintOf(building));

export const paintBuilding = (building: Building, draft: TileDraft, p: Vec2) => {
  const { u, v } = toLocal(building.frame, p);
  const cell = cellOf(building.plan, u, v);
  draft.height = levelOf(building, 0, p);
  draft.ground = Ground.Planks;
  draft.water = Water.None;
  draft.way = Way.None;
  draft.prop = cell;
  draft.part = 0;
  draft.cover = cell === Prop.Door ? Cover.None : building.roof;
};
