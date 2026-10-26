import { describe, expect, it } from "vitest";
import type { Vec2 } from "procgen";
import { Prop } from "../worldgen";
import { lineOfSight } from "./sight";
import { fieldOf } from "./terrain.fixtures";

const ORIGIN: Vec2 = { x: 0, y: 0 };
const EAST: Vec2 = { x: 1, y: 0 };
const REACH = 24;

describe("lineOfSight", () => {
  const open = fieldOf(() => Prop.None);
  const wallAt = (at: number, prop: Prop = Prop.Oak) => fieldOf((x) => (x === at ? prop : Prop.None));

  it("sees to its reach, unobscured, over open ground", () => {
    expect(lineOfSight(open, ORIGIN, EAST, REACH)).toMatchObject({ clear: REACH, obscurity: 0 });
  });

  it("is stopped at the edge of an obstacle reaching eye level", () => {
    expect(lineOfSight(wallAt(1), ORIGIN, EAST, REACH).clear).toBeCloseTo(0.5);
    expect(lineOfSight(wallAt(4), ORIGIN, EAST, REACH).clear).toBeCloseTo(3.5);
  });

  it("is more obscured the nearer the obstacle", () => {
    const obscurity = (at: number) => lineOfSight(wallAt(at), ORIGIN, EAST, REACH).obscurity;
    expect(obscurity(1)).toBeGreaterThan(obscurity(2));
    expect(obscurity(2)).toBeGreaterThan(obscurity(8));
    expect(obscurity(8)).toBeGreaterThan(0);
  });

  it("sees past things below eye level, obscured less than by tall things", () => {
    const boulder = lineOfSight(wallAt(1, Prop.Boulder), ORIGIN, EAST, REACH);
    expect(boulder.clear).toBe(REACH);
    expect(boulder.obscurity).toBeGreaterThan(0);
    expect(boulder.obscurity).toBeLessThan(lineOfSight(wallAt(1), ORIGIN, EAST, REACH).obscurity / 2);
  });

  it("is obscured more by taller short things", () => {
    const obscurity = (prop: Prop) => lineOfSight(wallAt(1, prop), ORIGIN, EAST, REACH).obscurity;
    expect(obscurity(Prop.Hay)).toBeGreaterThan(obscurity(Prop.Boulder));
    expect(obscurity(Prop.Boulder)).toBeGreaterThan(obscurity(Prop.Stump));
  });

  it("is not obscured by anything whose top is below its feet", () => {
    const below = fieldOf(
      (x) => (x >= 2 ? Prop.Pine : Prop.None),
      (x) => (x >= 2 ? 84 : 100),
    );
    expect(lineOfSight(below, ORIGIN, EAST, REACH)).toMatchObject({ clear: REACH, obscurity: 0 });
  });

  it("is stopped by tall things on lower ground that still reach eye level", () => {
    const below = fieldOf(
      (x) => (x >= 2 ? Prop.Pine : Prop.None),
      (x) => (x >= 2 ? 92 : 100),
    );
    expect(lineOfSight(below, ORIGIN, EAST, REACH).clear).toBeCloseTo(1.5);
  });

  it("is stopped by ground rising past eye level, and sees over ground falling away", () => {
    const stepAt2 = (height: number) =>
      fieldOf(
        () => Prop.None,
        (x) => (x >= 2 ? height : 100),
      );
    expect(lineOfSight(stepAt2(120), ORIGIN, EAST, REACH).clear).toBeCloseTo(1.5);
    expect(lineOfSight(stepAt2(80), ORIGIN, EAST, REACH)).toMatchObject({ clear: REACH, obscurity: 0 });
  });

  it("sees across a dip back to ground no higher than its feet", () => {
    const dip = fieldOf(
      () => Prop.None,
      (x) => (x === 1 ? 84 : 100),
    );
    expect(lineOfSight(dip, ORIGIN, EAST, REACH)).toMatchObject({ clear: REACH, obscurity: 0 });
  });

  it("does not slip between obstacles that meet at a corner", () => {
    const diagonalWall = fieldOf((x, y) => (x + y === 3 ? Prop.Oak : Prop.None));
    expect(lineOfSight(diagonalWall, ORIGIN, { x: Math.SQRT1_2, y: Math.SQRT1_2 }, REACH).clear).toBeLessThan(3);
  });

  it("measures how far the ground it crosses falls below its feet", () => {
    const fallingEast = fieldOf(
      () => Prop.None,
      (x) => 100 - x,
    );
    expect(lineOfSight(open, ORIGIN, EAST, REACH).drop).toBe(0);
    expect(lineOfSight(fallingEast, ORIGIN, EAST, REACH).drop).toBeCloseTo(12.5);
    expect(lineOfSight(fallingEast, ORIGIN, { x: -1, y: 0 }, REACH).drop).toBe(0);
  });
});
