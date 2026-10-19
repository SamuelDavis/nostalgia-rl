import type { Vec2 } from "../core/geometry";

export interface PlacedProp<K> {
  readonly kind: K;
  readonly at: Vec2;
}

const SINGLE_TILE: Vec2 = { x: 1, y: 1 };

export const footprints = <K extends PropertyKey>(sizes: { readonly [Kind in K]?: Vec2 }) => {
  const sizeOf = (kind: K): Vec2 => sizes[kind] ?? SINGLE_TILE;
  const tilesOf = ({ kind, at }: PlacedProp<K>): Vec2[] => {
    const { x: width, y: depth } = sizeOf(kind);
    return Array.from({ length: width * depth }, (_, i) => ({
      x: at.x + (i % width),
      y: at.y + Math.floor(i / width),
    }));
  };
  return {
    sizeOf,
    tilesOf,
    partOf: ({ kind, at }: PlacedProp<K>, p: Vec2): number | undefined => {
      const { x: width, y: depth } = sizeOf(kind);
      const [dx, dy] = [p.x - at.x, p.y - at.y];
      return dx >= 0 && dx < width && dy >= 0 && dy < depth ? dy * width + dx : undefined;
    },
    fits: (prop: PlacedProp<K>, isFree: (p: Vec2) => boolean): boolean => tilesOf(prop).every(isFree),
  };
};
