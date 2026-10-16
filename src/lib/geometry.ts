export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SegmentProjection {
  readonly distance: number;
  readonly t: number;
}

export const distance = (a: Point, b: Point): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const projectOntoSegment = (p: Point, a: Point, b: Point): SegmentProjection => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return { distance: distance(p, { x: a.x + dx * t, y: a.y + dy * t }), t };
};

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export const relativeNeighbours = <P extends Point>(origin: Point, candidates: readonly P[]): P[] =>
  candidates.filter((c) => {
    if (samePoint(c, origin)) return false;
    const span = distance(origin, c);
    return !candidates.some(
      (w) => !samePoint(w, c) && !samePoint(w, origin) && Math.max(distance(origin, w), distance(c, w)) < span,
    );
  });
