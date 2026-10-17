import { describe, expect, it } from "vitest";
import { contourBetween, hillshade, reliefTint } from "./palette";

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

describe("reliefTint", () => {
  const alpha = (rise: number) => reliefTint(rise)[3];

  it("leaves ground at eye level untouched", () => {
    expect(alpha(0)).toBe(0);
  });

  it("lightens ground above the eye and darkens ground below it", () => {
    expect(reliefTint(4).slice(0, 3)).toEqual([255, 255, 255]);
    expect(reliefTint(-4).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it("keeps telling ledges apart however far above or below they are", () => {
    expect(alpha(16)).toBeGreaterThan(alpha(8));
    expect(alpha(32)).toBeGreaterThan(alpha(16));
    expect(alpha(-32)).toBeGreaterThan(alpha(-16));
    expect(alpha(1000)).toBeLessThan(1);
  });
});
