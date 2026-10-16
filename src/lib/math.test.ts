import { describe, expect, it } from "vitest";
import { clamp, floorDiv, inverseLerp, lerp, mod, smoothstep, terrace } from "./math";

describe("mod", () => {
  it("is non-negative for negative dividends", () => {
    expect(mod(-1, 32)).toBe(31);
    expect(mod(-32, 32)).toBe(0);
    expect(mod(33, 32)).toBe(1);
  });
});

describe("floorDiv", () => {
  it("floors toward negative infinity", () => {
    expect(floorDiv(-1, 32)).toBe(-1);
    expect(floorDiv(-32, 32)).toBe(-1);
    expect(floorDiv(-33, 32)).toBe(-2);
    expect(floorDiv(31, 32)).toBe(0);
  });
});

describe("interpolation", () => {
  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });

  it("lerps and inverts", () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(inverseLerp(10, 20, 12.5)).toBe(0.25);
  });

  it("smoothsteps with clamped ends", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });
});

describe("terrace", () => {
  const step = 0.1;
  const riser = 0.25;

  it("passes through each step boundary", () => {
    expect(terrace(0.3, step, riser)).toBeCloseTo(0.3);
  });

  it("is flat along a tread", () => {
    expect(terrace(0.31, step, riser)).toBeCloseTo(0.3);
    expect(terrace(0.37, step, riser)).toBeCloseTo(0.3);
  });

  it("climbs to the next step across the riser", () => {
    expect(terrace(0.3875, step, riser)).toBeCloseTo(0.35);
    expect(terrace(0.3999999, step, riser)).toBeCloseTo(0.4);
  });

  it("never descends", () => {
    let previous = -Infinity;
    for (let v = 0; v < 1; v += 0.001) {
      expect(terrace(v, step, riser)).toBeGreaterThanOrEqual(previous);
      previous = terrace(v, step, riser);
    }
  });
});
