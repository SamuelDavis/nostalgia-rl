import { describe, expect, it } from "vitest";
import { projectOntoSegment } from "./geometry";

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
