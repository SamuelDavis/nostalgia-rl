import { describe, expect, it } from "vitest";
import { createTickClock } from "./clock";

describe("createTickClock", () => {
  it("is not due before its first tick", () => {
    expect(createTickClock(10, 0).due(9)).toEqual([]);
  });

  it("reports every tick due, each at its scheduled moment, not when it was noticed", () => {
    const clock = createTickClock(10, 0);
    expect(clock.due(36)).toEqual([10, 20, 30]);
    expect(clock.due(38)).toEqual([]);
    expect(clock.due(41)).toEqual([40]);
  });

  it("catches up at most a bounded span after a stall, then resumes its pace", () => {
    const clock = createTickClock(10, 0);
    const caughtUp = clock.due(10_000);
    expect(caughtUp.length).toBeLessThan(100);
    expect(caughtUp.at(-1)).toBe(10_000);
    expect(clock.due(10_010)).toEqual([10_010]);
  });
});
