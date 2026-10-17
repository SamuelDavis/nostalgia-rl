import type { Point } from "../../lib";
import type { Ground, Prop, Water, Way } from "../terrain";

export interface Anchor extends Point {
  readonly id: number;
}

export interface TileDraft {
  height: number;
  ground: Ground;
  water: Water;
  prop: Prop;
  readonly way: Way;
}

export interface FeatureType<A extends Anchor, L> {
  readonly name: string;
  readonly priority: number;
  readonly reach: number;
  readonly build: (anchor: A) => L;
  readonly paint: (layout: L, draft: TileDraft, x: number, y: number) => boolean;
}

export interface PlacedFeature {
  readonly anchor: Anchor;
  readonly priority: number;
  readonly reach: number;
  readonly paint: (draft: TileDraft, x: number, y: number) => boolean;
}

export const place = <A extends Anchor, L>(type: FeatureType<A, L>, anchor: A): PlacedFeature => {
  const layout = type.build(anchor);
  return {
    anchor,
    priority: type.priority,
    reach: type.reach,
    paint: (draft, x, y) => type.paint(layout, draft, x, y),
  };
};

export const paintInOrder = (features: readonly PlacedFeature[], draft: TileDraft, x: number, y: number): boolean =>
  features.reduce((claimed, feature) => feature.paint(draft, x, y) || claimed, false);
