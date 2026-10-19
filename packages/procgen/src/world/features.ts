import { type Bounds, type Vec2, boundsOf, byPosition, contains, expand, overlaps, within } from "../core/geometry";
import type { Grid } from "./grid";
import { type Dependency, type Stage, type StageContext, stage } from "./stage";

export interface FeatureType<A extends Vec2, L, D> {
  readonly name: string;
  readonly priority: number;
  readonly sites: Stage<readonly A[]>;
  readonly reach: number;
  readonly reads?: readonly Dependency[];
  readonly build: (anchor: A, context: StageContext) => L;
  readonly bounds: (layout: L, anchor: A) => Bounds;
  readonly paint: (layout: L, draft: D, x: number, y: number) => boolean;
}

export interface Placed<D, A extends Vec2 = Vec2, L = unknown> {
  readonly type: string;
  readonly priority: number;
  readonly anchor: A;
  readonly layout: L;
  readonly bounds: Bounds;
  readonly paint: (draft: D, x: number, y: number) => boolean;
}

export type AnyFeatureType<D> = FeatureType<any, any, D>;

const placedStages = new WeakMap<object, Stage<readonly Placed<never>[]>>();

export const placedOf = <A extends Vec2, L, D>(type: FeatureType<A, L, D>): Stage<readonly Placed<D, A, L>[]> => {
  const existing = placedStages.get(type);
  if (existing) return existing as unknown as Stage<readonly Placed<D, A, L>[]>;
  const placed = stage({
    name: `${type.name} layouts`,
    grid: type.sites.grid,
    reads: [{ stage: type.sites, radius: 0 }, ...(type.reads ?? [])],
    compute: (cell, context): readonly Placed<D, A, L>[] =>
      context.read(type.sites, cell).map((anchor) => {
        const layout = type.build(anchor, context);
        const bounds = type.bounds(layout, anchor);
        if (!within(bounds, boundsOf([anchor], type.reach)))
          throw new Error(`Feature "${type.name}" at ${anchor.x},${anchor.y} paints beyond its reach ${type.reach}`);
        return {
          type: type.name,
          priority: type.priority,
          anchor,
          layout,
          bounds,
          paint: (draft, x, y) => type.paint(layout, draft, x, y),
        };
      }),
  });
  placedStages.set(type, placed as unknown as Stage<readonly Placed<never>[]>);
  return placed;
};

export const featuresNear = <D>(
  name: string,
  grid: Grid,
  types: readonly AnyFeatureType<D>[],
): Stage<readonly Placed<D>[]> =>
  stage({
    name,
    grid,
    reads: types.map((type) => ({ stage: placedOf(type), radius: type.reach })),
    compute: (cell, { gather }) => {
      const area = grid.boundsOf(cell);
      return types
        .flatMap((type, order) =>
          gather(placedOf(type), expand(area, type.reach))
            .filter(({ bounds }) => overlaps(bounds, area))
            .map((placed) => ({ placed, order })),
        )
        .sort(
          (a, b) =>
            a.placed.priority - b.placed.priority || a.order - b.order || byPosition(a.placed.anchor, b.placed.anchor),
        )
        .map(({ placed }) => placed as Placed<D>);
    },
  });

export const paintFeatures = <D>(placed: readonly Placed<D>[], draft: D, x: number, y: number): boolean => {
  const p = { x, y };
  let claimed = false;
  for (const feature of placed) if (contains(feature.bounds, p)) claimed = feature.paint(draft, x, y) || claimed;
  return claimed;
};
