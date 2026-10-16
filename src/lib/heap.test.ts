import { describe, expect, it } from "vitest";
import { MinHeap } from "./heap";

describe("MinHeap", () => {
  it("pops in priority order", () => {
    const heap = new MinHeap<string>();
    [5, 1, 4, 2, 3].forEach((p) => heap.push(String(p), p));
    expect(Array.from({ length: 5 }, () => heap.pop())).toEqual(["1", "2", "3", "4", "5"]);
    expect(heap.pop()).toBeUndefined();
  });
});
