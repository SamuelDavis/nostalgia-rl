import { describe, expect, it } from "vitest";
import { type Point } from "../lib";
import { approach, lookOffset, naturalSpan, openness, steer } from "./camera";

const cone = (x: number, y: number) => 200 - Math.abs(x) - Math.abs(y);
const plain = () => 100;
const risingEast = (x: number) => 100 + x;

const EAST: Point = { x: 1, y: 0 };
const WEST: Point = { x: -1, y: 0 };
const SOUTH: Point = { x: 0, y: 1 };
const STILL: Point = { x: 0, y: 0 };
const ORIGIN: Point = { x: 0, y: 0 };

const walk = (steps: readonly Point[], from: Point = STILL) => steps.reduce(steer, from);

describe("openness", () => {
  it("is closed in every direction on level ground", () => {
    expect(openness(plain, ORIGIN).every((o) => o === 0)).toBe(true);
  });

  it("is open in every direction from a summit", () => {
    expect(openness(cone, ORIGIN).every((o) => o > 0.5)).toBe(true);
  });

  it("is open down a slope and closed up it", () => {
    const open = openness(risingEast, ORIGIN);
    expect(Math.max(...open)).toBeGreaterThan(0.5);
    expect(Math.min(...open)).toBe(0);
  });
});

describe("steer", () => {
  it("takes a few steps to establish a heading", () => {
    expect(walk([EAST]).x).toBeLessThan(0.5);
    expect(walk([EAST, EAST, EAST, EAST, EAST]).x).toBeGreaterThan(0.75);
  });

  it("keeps an established heading through a single turn", () => {
    const heading = walk([SOUTH], walk(Array(6).fill(EAST)));
    expect(heading.x).toBeGreaterThan(heading.y);
  });

  it("settles on a diagonal when alternating directions", () => {
    const heading = walk(Array.from({ length: 12 }, (_, i) => (i % 2 ? EAST : SOUTH)));
    expect(Math.abs(heading.x - heading.y)).toBeLessThan(0.35);
  });
});

describe("naturalSpan", () => {
  it("stays close on level ground whichever way you look", () => {
    expect(naturalSpan(openness(plain, ORIGIN), EAST)).toBe(naturalSpan(openness(plain, ORIGIN), STILL));
  });

  it("opens looking down a slope and stays close looking up it", () => {
    const slope = openness(risingEast, ORIGIN);
    expect(naturalSpan(slope, WEST)).toBeGreaterThan(naturalSpan(slope, EAST));
    expect(naturalSpan(slope, EAST)).toBe(naturalSpan(openness(plain, ORIGIN), EAST));
  });

  it("opens from a summit whichever way you look", () => {
    const summit = openness(cone, ORIGIN);
    expect(naturalSpan(summit, EAST)).toBeGreaterThan(naturalSpan(openness(plain, ORIGIN), EAST));
    expect(naturalSpan(summit, EAST)).toBe(naturalSpan(summit, WEST));
  });
});

describe("lookOffset", () => {
  it("leads in the established heading", () => {
    const offset = lookOffset(openness(plain, ORIGIN), EAST);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.y).toBe(0);
  });

  it("leans toward open ground, away from rising ground", () => {
    expect(lookOffset(openness(risingEast, ORIGIN), STILL).x).toBeLessThan(0);
    expect(lookOffset(openness(cone, ORIGIN), STILL).x).toBeCloseTo(0);
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
