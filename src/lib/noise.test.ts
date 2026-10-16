import { describe, expect, it } from "vitest";
import { createNoise, fbm } from "./noise";

describe("createNoise", () => {
  it("is reproducible from seed and salt", () => {
    const a = createNoise(42, 1);
    const b = createNoise(42, 1);
    expect(a(10.5, -3.25)).toBe(b(10.5, -3.25));
  });

  it("differs by salt", () => {
    expect(createNoise(42, 1)(10.5, 3.5)).not.toBe(createNoise(42, 2)(10.5, 3.5));
  });
});

describe("fbm", () => {
  it("stays within [-1, 1]", () => {
    const field = fbm(createNoise(1, 1), { octaves: 5 });
    for (let i = 0; i < 2000; i++) {
      const v = field(i * 0.37, i * -0.61);
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
    }
  });

  it("scales coordinates by frequency", () => {
    const base = createNoise(3, 3);
    expect(fbm(base, { octaves: 1, frequency: 0.5 })(4, 4)).toBe(base(2, 2));
  });
});
