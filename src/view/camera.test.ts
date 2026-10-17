import { describe, expect, it } from "vitest";
import { Direction } from "../game/movement";
import { approach, leadToward, naturalSpan, prominence } from "./camera";

const cone = (x: number, y: number) => 200 - Math.abs(x) - Math.abs(y);
const bowl = (x: number, y: number) => 100 + Math.abs(x) + Math.abs(y);
const plain = () => 100;

describe("prominence", () => {
  it("is zero on level ground", () => {
    expect(prominence(plain, { x: 0, y: 0 })).toBe(0);
  });

  it("is positive on a summit and negative in a hollow", () => {
    expect(prominence(cone, { x: 0, y: 0 })).toBeGreaterThan(0);
    expect(prominence(bowl, { x: 0, y: 0 })).toBeLessThan(0);
  });

  it("is near zero partway up an even slope", () => {
    expect(Math.abs(prominence((x) => x, { x: 0, y: 0 }))).toBeLessThan(1);
  });
});

describe("naturalSpan", () => {
  it("stays close in hollows and on level ground", () => {
    expect(naturalSpan(-10)).toBe(naturalSpan(0));
  });

  it("widens with prominence, up to a limit", () => {
    expect(naturalSpan(8)).toBeGreaterThan(naturalSpan(0));
    expect(naturalSpan(1000)).toBe(naturalSpan(10000));
  });
});

describe("leadToward", () => {
  it("leads a quarter of the view in the facing direction", () => {
    expect(leadToward(Direction.East, { width: 40, height: 20 })).toEqual({ x: 10, y: 0 });
    expect(leadToward(Direction.North, { width: 40, height: 20 })).toEqual({ x: 0, y: -5 });
  });
});

describe("approach", () => {
  it("moves part of the way toward the target, more with more time", () => {
    const short = approach(0, 10, 50);
    const long = approach(0, 10, 500);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(10);
  });
});
