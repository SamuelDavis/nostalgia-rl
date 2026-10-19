import { describe, expect, it } from "vitest";
import { hash, hash3, hash4, hashString, rngOf, unit } from "./hash";

describe("hash", () => {
  it("is a pure function of its keys, their order and their count", () => {
    expect(hash(1, 2, 3)).toBe(hash(1, 2, 3));
    expect(hash(1, 2)).not.toBe(hash(2, 1));
    expect(hash(0)).not.toBe(hash(0, 0));
  });

  it("has fixed-arity forms equal to the general one", () => {
    expect(hash3(1, -2, 0.5)).toBe(hash(1, -2, 0.5));
    expect(hash4(1, -2, 3, 1e12)).toBe(hash(1, -2, 3, 1e12));
  });

  it("returns a uint32", () => {
    for (let i = -500; i < 500; i++) {
      const h = hash(i, i * 7);
      expect(Number.isInteger(h) && h >= 0 && h < 0x1_0000_0000).toBe(true);
    }
  });

  it("tells apart keys that int32 truncation would merge", () => {
    expect(hash(0.25)).not.toBe(hash(0));
    expect(hash(0x1_0000_0001)).not.toBe(hash(1));
    expect(hash(-0.5)).not.toBe(hash(0));
  });

  it("distributes uniformly", () => {
    const buckets = new Array<number>(16).fill(0);
    for (let x = 0; x < 256; x++) for (let y = 0; y < 250; y++) buckets[hash(7, x, y) % 16]!++;
    const expected = (256 * 250) / 16;
    const chiSquare = buckets.reduce((sum, n) => sum + ((n - expected) * (n - expected)) / expected, 0);
    expect(chiSquare).toBeLessThan(37.7);
  });

  it("hashes strings to stable uint32s", () => {
    expect(hashString("camps")).toBe(hashString("camps"));
    expect(hashString("camps")).not.toBe(hashString("caves"));
  });

  it("maps a hash into [0, 1)", () => {
    expect(unit(0)).toBe(0);
    expect(unit(0xffff_ffff)).toBeLessThan(1);
  });
});

describe("rng", () => {
  const rng = rngOf(42, "test");

  it("answers the same keys the same way, in any order of asking", () => {
    const first = [rng.unit(1), rng.unit(2), rng.unit(3)];
    const reversed = [rng.unit(3), rng.unit(2), rng.unit(1)].reverse();
    expect(reversed).toEqual(first);
  });

  it("derives independent children from salts and keys", () => {
    expect(rng.child("a").u32(0)).toBe(rngOf(42, "test", "a").u32(0));
    expect(rng.child("a").u32(0)).not.toBe(rng.child("b").u32(0));
    expect(rng.child(1, 2).u32(0)).not.toBe(rng.child(2, 1).u32(0));
    expect(rngOf(43, "test").u32(0)).not.toBe(rng.u32(0));
  });

  it("draws integers in an inclusive range", () => {
    const draws = Array.from({ length: 2000 }, (_, i) => rng.int(-2, 2, i));
    expect(new Set(draws)).toEqual(new Set([-2, -1, 0, 1, 2]));
  });

  it("answers chances near their probability", () => {
    const hits = Array.from({ length: 10_000 }, (_, i) => rng.chance(0.3, i)).filter(Boolean).length;
    expect(hits / 10_000).toBeCloseTo(0.3, 1);
  });

  it("picks by weight", () => {
    const picks = Array.from({ length: 10_000 }, (_, i) =>
      rng.weighted(
        [
          ["rare", 1],
          ["common", 9],
        ],
        i,
      ),
    );
    expect(picks.filter((p) => p === "rare").length / 10_000).toBeCloseTo(0.1, 1);
  });

  it("shuffles into a permutation", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(items, 9);
    expect([...shuffled].sort()).toEqual(items);
    expect(rng.shuffle(items, 9)).toEqual(shuffled);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
