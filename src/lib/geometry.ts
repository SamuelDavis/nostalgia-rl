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
