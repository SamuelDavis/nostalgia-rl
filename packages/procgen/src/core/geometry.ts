export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface Vec3 extends Vec2 {
  readonly z: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (v: Vec2, k: number): Vec2 => ({ x: v.x * k, y: v.y * k });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const distanceSquared = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

export const distance = (a: Vec2, b: Vec2): number => Math.sqrt(distanceSquared(a, b));

export const samePoint = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y;

export const byPosition = (a: Vec2, b: Vec2): number => a.y - b.y || a.x - b.x;

export interface SegmentProjection {
  readonly distance: number;
  readonly t: number;
}

export const projectOntoSegment = (p: Vec2, a: Vec2, b: Vec2): SegmentProjection => {
  const d = sub(b, a);
  const lengthSquared = dot(d, d);
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), d) / lengthSquared));
  return { distance: distance(p, add(a, scale(d, t))), t };
};

export const distanceToPolyline = (p: Vec2, nodes: readonly Vec2[]): number => {
  if (nodes.length === 1) return distance(p, nodes[0]!);
  let nearest = Infinity;
  for (let i = 1; i < nodes.length; i++)
    nearest = Math.min(nearest, projectOntoSegment(p, nodes[i - 1]!, nodes[i]!).distance);
  return nearest;
};

export const relativeNeighbours = <P extends Vec2>(origin: Vec2, candidates: readonly P[]): P[] =>
  candidates.filter((c) => {
    if (samePoint(c, origin)) return false;
    const span = distanceSquared(origin, c);
    return !candidates.some(
      (w) =>
        !samePoint(w, c) && !samePoint(w, origin) && Math.max(distanceSquared(origin, w), distanceSquared(c, w)) < span,
    );
  });

export const boundsOf = (points: readonly Vec2[], margin = 0): Bounds => ({
  minX: Math.min(...points.map((p) => p.x)) - margin,
  minY: Math.min(...points.map((p) => p.y)) - margin,
  maxX: Math.max(...points.map((p) => p.x)) + margin,
  maxY: Math.max(...points.map((p) => p.y)) + margin,
});

export const expand = ({ minX, minY, maxX, maxY }: Bounds, margin: number): Bounds => ({
  minX: minX - margin,
  minY: minY - margin,
  maxX: maxX + margin,
  maxY: maxY + margin,
});

export const overlaps = (a: Bounds, b: Bounds): boolean =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

export const contains = ({ minX, minY, maxX, maxY }: Bounds, p: Vec2): boolean =>
  p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;

export const within = (inner: Bounds, outer: Bounds): boolean =>
  inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
