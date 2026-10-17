import { describe, expect, it } from "vitest";
import { Direction } from "../game/movement";
import { directionAt } from "./tap";

const SCREEN = { width: 400, height: 200 };

describe("directionAt", () => {
  it("splits the screen into triangles along its diagonals", () => {
    expect(directionAt({ x: 200, y: 10 }, SCREEN)).toBe(Direction.North);
    expect(directionAt({ x: 390, y: 100 }, SCREEN)).toBe(Direction.East);
    expect(directionAt({ x: 200, y: 190 }, SCREEN)).toBe(Direction.South);
    expect(directionAt({ x: 10, y: 100 }, SCREEN)).toBe(Direction.West);
  });

  it("follows the diagonals of a wide screen, not 45°", () => {
    expect(directionAt({ x: 340, y: 20 }, SCREEN)).toBe(Direction.North);
    expect(directionAt({ x: 380, y: 20 }, SCREEN)).toBe(Direction.East);
  });
});
