import { describe, expect, it } from "vitest";
import {
  boundsOf,
  contains,
  distanceToPolyline,
  expand,
  overlaps,
  projectOntoSegment,
  relativeNeighbours,
  within,
} from "./geometry";

describe("geometry", () => {
  it("projects onto a segment, clamped to its ends", () => {
    expect(projectOntoSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ distance: 3, t: 0.5 });
    expect(projectOntoSegment({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ distance: 5, t: 0 });
  });

  it("measures the distance to the nearest segment of a polyline", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(distanceToPolyline({ x: 12, y: 5 }, line)).toBe(2);
    expect(distanceToPolyline({ x: 3, y: 4 }, [{ x: 0, y: 0 }])).toBe(5);
  });

  it("links only relative neighbours: no third point is closer to both", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 1 },
    ];
    expect(relativeNeighbours(points[0]!, points)).toEqual([points[2]]);
  });

  it("bounds, expands, overlaps and contains", () => {
    const b = boundsOf([
      { x: 1, y: 2 },
      { x: 3, y: -1 },
    ]);
    expect(b).toEqual({ minX: 1, minY: -1, maxX: 3, maxY: 2 });
    expect(expand(b, 1)).toEqual({ minX: 0, minY: -2, maxX: 4, maxY: 3 });
    expect(overlaps(b, { minX: 3, minY: 2, maxX: 9, maxY: 9 })).toBe(true);
    expect(overlaps(b, { minX: 4, minY: 2, maxX: 9, maxY: 9 })).toBe(false);
    expect(contains(b, { x: 3, y: 2 })).toBe(true);
    expect(within(b, expand(b, 1))).toBe(true);
    expect(within(expand(b, 1), b)).toBe(false);
  });
});
