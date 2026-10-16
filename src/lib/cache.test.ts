import { describe, expect, it } from "vitest";
import { memoize } from "./cache";

describe("memoize", () => {
  it("computes once per key", () => {
    let calls = 0;
    const square = memoize((n: number) => (calls++, n * n), String, 10);
    expect(square(3)).toBe(9);
    expect(square(3)).toBe(9);
    expect(calls).toBe(1);
  });

  it("evicts the least recently used entry beyond capacity", () => {
    let calls = 0;
    const identity = memoize((n: number) => (calls++, n), String, 2);
    identity(1);
    identity(2);
    identity(1);
    identity(3);
    identity(1);
    expect(calls).toBe(3);
    identity(2);
    expect(calls).toBe(4);
  });
});
