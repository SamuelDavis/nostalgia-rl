import { describe, expect, it } from "vitest";
import { clamp, floorDiv, inverseLerp, lerp, mod, smoothstep } from "./math";

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
