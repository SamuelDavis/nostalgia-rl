import { describe, expect, it } from "vitest";
import { contourBetween, hillshade, relativeHeightShade } from "./palette";

describe("hillshade", () => {
  it("leaves flat ground unchanged", () => {
    expect(hillshade(0, 0)).toBeCloseTo(1);
  });

  it("lights slopes facing the northwest and darkens slopes facing the southeast", () => {
    expect(hillshade(1, 1)).toBeGreaterThan(1);
    expect(hillshade(-1, -1)).toBeLessThan(1);
  });

  it("shades steeper slopes more strongly", () => {
    expect(hillshade(-1, 0)).toBeLessThan(hillshade(-0.5, 0));
  });
});

describe("contourBetween", () => {
  it("finds no contour between levels in the same interval", () => {
    expect(contourBetween(20, 23)).toBe("none");
  });

  it("finds a minor contour across an interval boundary", () => {
    expect(contourBetween(23, 24)).toBe("minor");
  });

  it("finds an index contour across every fifth boundary", () => {
    expect(contourBetween(39, 40)).toBe("index");
    expect(contourBetween(45, 38)).toBe("index");
  });
});

describe("relativeHeightShade", () => {
  const fromEye = relativeHeightShade(100);

  it("leaves ground at eye level unchanged", () => {
    expect(fromEye(100)).toBe(1);
  });

  it("lightens ground above the eye and darkens ground below it", () => {
    expect(fromEye(102)).toBeGreaterThan(1);
    expect(fromEye(98)).toBeLessThan(1);
  });

  it("stops changing a few metres away from eye level", () => {
    expect(fromEye(140)).toBe(fromEye(200));
    expect(fromEye(60)).toBe(fromEye(0));
  });
});
