import { describe, expect, it } from "vitest";
import { type Spline, evaluateSpline, splineOver } from "./spline";

interface Inputs {
  readonly a: number;
  readonly b: number;
}

const overA = splineOver<Inputs>((i) => i.a);
const overB = splineOver<Inputs>((i) => i.b);

describe("evaluateSpline", () => {
  const ramp = overA([
    [0, 0, 1],
    [1, 1, 1],
  ]);

  it("passes through its control points", () => {
    expect(evaluateSpline(ramp, { a: 0, b: 0 })).toBe(0);
    expect(evaluateSpline(ramp, { a: 1, b: 0 })).toBe(1);
  });

  it("is linear between points whose slopes match the chord", () => {
    expect(evaluateSpline(ramp, { a: 0.25, b: 0 })).toBeCloseTo(0.25);
  });

  it("extends past its ends along the end slopes", () => {
    expect(evaluateSpline(ramp, { a: 2, b: 0 })).toBeCloseTo(2);
    expect(evaluateSpline(ramp, { a: -1, b: 0 })).toBeCloseTo(-1);
  });

  it("stays flat between equal points with zero slope", () => {
    const plateau = overA([
      [0, 0.35, 0],
      [1, 0.35, 0],
    ]);
    expect(evaluateSpline(plateau, { a: 0.6, b: 0 })).toBeCloseTo(0.35);
  });

  it("eases with zero end slopes", () => {
    const ease = overA([
      [0, 0, 0],
      [1, 1, 0],
    ]);
    expect(evaluateSpline(ease, { a: 0.25, b: 0 })).toBeLessThan(0.25);
    expect(evaluateSpline(ease, { a: 0.5, b: 0 })).toBeCloseTo(0.5);
  });

  it("evaluates nested splines on their own input", () => {
    const nested: Spline<Inputs> = overA([
      [
        0,
        overB([
          [0, 10, 0],
          [1, 20, 0],
        ]),
        0,
      ],
      [1, 30, 0],
    ]);
    expect(evaluateSpline(nested, { a: 0, b: 1 })).toBeCloseTo(20);
    expect(evaluateSpline(nested, { a: 1, b: 0 })).toBeCloseTo(30);
    expect(evaluateSpline(nested, { a: 0.5, b: 0.5 })).toBeCloseTo(22.5);
  });
});
