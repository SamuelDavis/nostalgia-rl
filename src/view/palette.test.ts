import { describe, expect, it } from "vitest";
import { contourBetween, hillshade } from "./palette";

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
