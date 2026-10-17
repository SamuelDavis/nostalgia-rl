import { describe, expect, it } from "vitest";
import { createFields } from "./fields";
import { HEIGHT_LEVELS, SEA_LEVEL, heightLevel } from "./constants";

const seeds = Array.from({ length: 20 }, (_, i) => i * 7919 + 1);

describe("fields", () => {
  it("are deterministic per seed", () => {
    const a = createFields(5);
    const b = createFields(5);
    expect(a.elevation(123, -456)).toBe(b.elevation(123, -456));
  });

  it("keep elevation, temperature, and moisture in [0, 1]", () => {
    const f = createFields(11);
    for (let i = 0; i < 5000; i++) {
      const x = ((i * 7_331) % 40_000) - 20_000;
      const y = ((i * 3_917) % 40_000) - 20_000;
      for (const field of [f.elevation, f.temperature, f.moisture]) {
        const v = field(x, y);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("put land at the origin for every seed", () => {
    for (const seed of seeds) expect(heightLevel(createFields(seed).elevation(0, 0))).toBeGreaterThan(SEA_LEVEL);
  });

  it("produce both land and water across a region", () => {
    const f = createFields(3);
    const levels = new Set<number>();
    for (let x = -8000; x < 8000; x += 97)
      for (let y = -8000; y < 8000; y += 101) levels.add(heightLevel(f.elevation(x, y)));
    expect(Math.min(...levels)).toBeLessThan(SEA_LEVEL);
    expect(Math.max(...levels)).toBeGreaterThan(HEIGHT_LEVELS * 0.9);
  });
});
