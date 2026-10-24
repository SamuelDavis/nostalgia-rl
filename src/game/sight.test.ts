import { describe, expect, it } from "vitest";
import type { Vec2 } from "procgen";
import { Prop } from "../worldgen";
import { clearSight } from "./sight";
import { fieldOf } from "./terrain.fixtures";

const ORIGIN: Vec2 = { x: 0, y: 0 };
const EAST: Vec2 = { x: 1, y: 0 };
const REACH = 24;

describe("clearSight", () => {
  const open = fieldOf(() => Prop.None);
  const wallAt = (at: number) => fieldOf((x) => (x === at ? Prop.Oak : Prop.None));

  it("sees to its reach over open ground", () => {
    expect(clearSight(open, ORIGIN, EAST, REACH)).toBe(REACH);
  });

  it("stops at the tile before an obstacle", () => {
    expect(clearSight(wallAt(1), ORIGIN, EAST, REACH)).toBe(0);
    expect(clearSight(wallAt(4), ORIGIN, EAST, REACH)).toBe(3);
  });

  it("sees over obstacles whose tops are below eye level, not at it", () => {
    const below = (drop: number, prop: Prop) =>
      fieldOf(
        (x) => (x >= 2 ? prop : Prop.None),
        (x) => (x >= 2 ? 100 - drop : 100),
      );
    expect(clearSight(below(16, Prop.Pine), ORIGIN, EAST, REACH)).toBe(REACH);
    expect(clearSight(below(2, Prop.Boulder), ORIGIN, EAST, REACH)).toBe(REACH);
    expect(clearSight(below(2, Prop.Pine), ORIGIN, EAST, REACH)).toBe(1);
    expect(clearSight(below(9, Prop.Pine), ORIGIN, EAST, REACH)).toBe(1);
  });

  it("sees through open props, however tall", () => {
    expect(
      clearSight(
        fieldOf((x) => (x === 2 ? Prop.Bush : Prop.None)),
        ORIGIN,
        EAST,
        REACH,
      ),
    ).toBe(REACH);
  });

  it("sees across a dip back to ground no higher than its eye", () => {
    const dip = fieldOf(
      () => Prop.None,
      (x) => (x === 1 ? 84 : 101),
    );
    expect(clearSight(dip, ORIGIN, EAST, REACH)).toBe(REACH);
  });

  it("does not slip between obstacles that meet at a corner", () => {
    const diagonalWall = fieldOf((x, y) => (x + y === 3 ? Prop.Oak : Prop.None));
    expect(clearSight(diagonalWall, ORIGIN, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, REACH)).toBeLessThan(3);
  });

  const stepAt2 = (height: number) =>
    fieldOf(
      () => Prop.None,
      (x) => (x >= 2 ? height : 100),
    );

  it("is stopped by a cliff rising ahead", () => {
    expect(clearSight(stepAt2(120), ORIGIN, EAST, REACH)).toBe(1);
  });

  it("sees over a cliff dropping away ahead", () => {
    expect(clearSight(stepAt2(80), ORIGIN, EAST, REACH)).toBe(REACH);
  });
});
