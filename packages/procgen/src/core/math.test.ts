import { describe, expect, it } from "vitest";
import { atan, atan2, clamp, cos, floorDiv, mod, powInt, remap, sin, smoothstep } from "./math";

describe("math", () => {
  it("wraps and floors towards negative infinity", () => {
    expect(mod(-1, 4)).toBe(3);
    expect(floorDiv(-1, 4)).toBe(-1);
    expect(floorDiv(4, 4)).toBe(1);
  });

  it("clamps, remaps and eases", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(remap(5, [0, 10], [100, 200])).toBe(150);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smoothstep(0, 1, 2)).toBe(1);
  });

  it("raises to integer powers exactly", () => {
    expect(powInt(0.5, 3)).toBe(0.125);
    expect(powInt(7, 0)).toBe(1);
  });

  it("approximates trigonometry within 1e-9 using only exactly specified operations", () => {
    for (let x = -50; x <= 50; x += 0.0137) {
      expect(Math.abs(sin(x) - Math.sin(x))).toBeLessThan(1e-9);
      expect(Math.abs(cos(x) - Math.cos(x))).toBeLessThan(1e-9);
      expect(Math.abs(atan(x) - Math.atan(x))).toBeLessThan(1e-9);
    }
    for (const [y, x] of [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
      [0, -1],
      [3, 0],
      [-3, 0],
      [0, 0],
      [0.2, -7],
    ] as const)
      expect(Math.abs(atan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-9);
  });
});
