import { describe, expect, it } from "vitest";
import { hash, hashString, intBetween, pick, unit } from "./hash";

describe("hash", () => {
  it("is deterministic", () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3));
  });

  it("returns uint32", () => {
    for (let i = 0; i < 1000; i++) {
      const h = hash(i, -i);
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    }
  });

  it("depends on key order and arity", () => {
    expect(hash(1, 2)).not.toBe(hash(2, 1));
    expect(hash(0)).not.toBe(hash(0, 0));
  });

  it("distributes uniformly across buckets", () => {
    const buckets = new Array(16).fill(0);
    const samples = 64_000;
    for (let x = 0; x < 256; x++) for (let y = 0; y < 250; y++) buckets[hash(7, x, y) % 16]++;
    const expected = samples / 16;
    const chiSquare = buckets.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    expect(chiSquare).toBeLessThan(37.7);
  });
});

describe("hashString", () => {
  it("is deterministic and discriminating", () => {
    expect(hashString("rivers")).toBe(hashString("rivers"));
    expect(hashString("rivers")).not.toBe(hashString("roads"));
  });
});

describe("unit", () => {
  it("maps uint32 into [0, 1)", () => {
    expect(unit(0)).toBe(0);
    expect(unit(2 ** 32 - 1)).toBeLessThan(1);
  });
});

describe("intBetween", () => {
  it("covers the inclusive range", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(intBetween(3, 6, hash(i)));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
});

describe("pick", () => {
  it("selects an element", () => {
    expect(["a", "b", "c"]).toContain(pick(["a", "b", "c"], hash(9)));
  });
});
