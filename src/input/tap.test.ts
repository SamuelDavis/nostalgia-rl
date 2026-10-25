import { describe, expect, it } from "vitest";
import { Heading } from "../game/movement";
import { headingAt } from "./tap";

const SCREEN = { width: 400, height: 200 };

describe("headingAt", () => {
  it("heads toward the edge pressed", () => {
    expect(headingAt({ x: 200, y: 10 }, SCREEN)).toBe(Heading.North);
    expect(headingAt({ x: 390, y: 100 }, SCREEN)).toBe(Heading.East);
    expect(headingAt({ x: 200, y: 190 }, SCREEN)).toBe(Heading.South);
    expect(headingAt({ x: 10, y: 100 }, SCREEN)).toBe(Heading.West);
  });

  it("heads diagonally toward the corner pressed, along the screen's own diagonals", () => {
    expect(headingAt({ x: 390, y: 10 }, SCREEN)).toBe(Heading.NorthEast);
    expect(headingAt({ x: 10, y: 190 }, SCREEN)).toBe(Heading.SouthWest);
    expect(headingAt({ x: 300, y: 50 }, SCREEN)).toBe(Heading.NorthEast);
  });
});
