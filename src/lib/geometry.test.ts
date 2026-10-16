import { describe, expect, it } from "vitest";
import { projectOntoSegment, relativeNeighbours } from "./geometry";

describe("projectOntoSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it("measures perpendicular distance and position along the segment", () => {
    expect(projectOntoSegment({ x: 4, y: 3 }, a, b)).toEqual({
      distance: 3,
      t: 0.4,
    });
  });

  it("clamps to the endpoints", () => {
    expect(projectOntoSegment({ x: -3, y: 4 }, a, b)).toEqual({
      distance: 5,
      t: 0,
    });
    expect(projectOntoSegment({ x: 13, y: 4 }, a, b)).toEqual({
      distance: 5,
      t: 1,
    });
  });

  it("handles degenerate segments", () => {
    expect(projectOntoSegment({ x: 3, y: 4 }, a, a)).toEqual({
      distance: 5,
      t: 0,
    });
  });
});

describe("relativeNeighbours", () => {
  it("keeps candidates with no third point closer to both ends", () => {
    const origin = { x: 0, y: 0 };
    const near = { x: 10, y: 0 };
    const behindNear = { x: 20, y: 0 };
    const side = { x: 0, y: 12 };
    expect(relativeNeighbours(origin, [near, behindNear, side])).toEqual([near, side]);
  });

  it("ignores the origin among candidates", () => {
    const origin = { x: 0, y: 0 };
    expect(relativeNeighbours(origin, [origin, { x: 5, y: 5 }])).toEqual([{ x: 5, y: 5 }]);
  });
});
