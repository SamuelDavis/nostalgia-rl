import { describe, expect, it } from "vitest";
import { Direction } from "../game/movement";
import { createGlide, facingAngle, turnToward } from "./motion";

const DURATION = 100;

describe("createGlide", () => {
  it("shows a still subject where it stands", () => {
    const glide = createGlide(DURATION, { x: 3, y: 4 });
    expect(glide.shownAt(0)).toEqual({ x: 3, y: 4 });
  });

  it("glides to a new tile over the duration from when the move was scheduled", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    glide.moveTo({ x: 1, y: 0 }, 1000);
    expect(glide.shownAt(1000)).toEqual({ x: 0, y: 0 });
    expect(glide.shownAt(1050)).toEqual({ x: 0.5, y: 0 });
    expect(glide.shownAt(1100)).toEqual({ x: 1, y: 0 });
    expect(glide.shownAt(2000)).toEqual({ x: 1, y: 0 });
  });

  it("keeps a steady pace across back-to-back moves processed late", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    glide.moveTo({ x: 1, y: 0 }, 0);
    glide.moveTo({ x: 2, y: 0 }, 100);
    expect(glide.shownAt(150)).toEqual({ x: 1.5, y: 0 });
  });

  it("slows at the start and end of each step, like footsteps", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    glide.moveTo({ x: 1, y: 0 }, 0);
    const covered = (from: number, to: number) => glide.shownAt(to).x - glide.shownAt(from).x;
    expect(covered(0, 10)).toBeLessThan(covered(45, 55) / 2);
    expect(covered(90, 100)).toBeLessThan(covered(45, 55) / 2);
    expect(covered(0, 10)).toBeGreaterThan(0);
  });

  it("varies a little from step to step", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    const starts = [1, 2, 3, 4].map((x) => {
      glide.moveTo({ x, y: 0 }, x * DURATION);
      return (glide.shownAt(x * DURATION + 10).x - (x - 1)).toFixed(6);
    });
    expect(new Set(starts).size).toBeGreaterThan(1);
  });

  it("turns mid-glide from where it is shown, without jumping", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    glide.moveTo({ x: 1, y: 0 }, 0);
    glide.moveTo({ x: 1, y: 1 }, 50);
    expect(glide.shownAt(50)).toEqual({ x: 0.5, y: 0 });
    expect(glide.shownAt(150)).toEqual({ x: 1, y: 1 });
  });
});

describe("facingAngle", () => {
  it("rotates clockwise from the glyph's natural eastward facing", () => {
    expect(facingAngle(Direction.East)).toBe(0);
    expect(facingAngle(Direction.South)).toBe(Math.PI / 2);
    expect(facingAngle(Direction.West)).toBe(Math.PI);
  });
});

describe("turnToward", () => {
  it("turns part of the way, the short way round", () => {
    const turned = turnToward(0, facingAngle(Direction.North), 30, 100);
    expect(turned).toBeLessThan(0);
    expect(turned).toBeGreaterThan(-Math.PI / 2);
  });

  it("arrives given time", () => {
    expect(turnToward(0, Math.PI / 2, 10000, 100)).toBeCloseTo(Math.PI / 2);
  });
});
