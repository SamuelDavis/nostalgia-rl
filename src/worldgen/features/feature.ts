import type { Point } from "../../lib";
import { MAX_CLIMB } from "../constants";
import type { Bounds } from "../region";
import type { Biome, Cover, Ground, Prop, Water, Way } from "../terrain";

export interface Anchor extends Point {
  readonly id: number;
}

export interface TileDraft {
  height: number;
  ground: Ground;
  water: Water;
  prop: Prop;
  part: number;
  way: Way;
  cover: Cover;
  readonly biome: Biome;
  readonly forestness: number;
}

export interface FeatureType<A extends Anchor, L> {
  readonly name: string;
  readonly priority: number;
  readonly reach: number;
  readonly bounds: (anchor: A) => Bounds;
  readonly build: (anchor: A) => L;
  readonly paint: (layout: L, draft: TileDraft, x: number, y: number) => boolean;
}

export interface PlacedFeature<L = unknown> {
  readonly anchor: Anchor;
  readonly layout: L;
  readonly priority: number;
  readonly bounds: Bounds;
  readonly paint: (draft: TileDraft, x: number, y: number) => boolean;
}

export const place = <A extends Anchor, L>(type: FeatureType<A, L>, anchor: A): PlacedFeature<L> => {
  const layout = type.build(anchor);
  return {
    anchor,
    layout,
    priority: type.priority,
    bounds: type.bounds(anchor),
    paint: (draft, x, y) => type.paint(layout, draft, x, y),
  };
};

export const settle = (level: number, target: number, gap: number): number => {
  const slack = Math.ceil(Math.max(0, gap)) * MAX_CLIMB;
  return Math.min(target + slack, Math.max(target - slack, level));
};

export const paintInOrder = (features: readonly PlacedFeature[], draft: TileDraft, x: number, y: number): boolean =>
  features.reduce((claimed, feature) => feature.paint(draft, x, y) || claimed, false);
