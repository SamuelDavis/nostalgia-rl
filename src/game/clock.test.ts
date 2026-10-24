import { describe, expect, it } from "vitest";
import { createTurnClock } from "./clock";

describe("createTurnClock", () => {
  it("is not due before its first turn", () => {
    expect(createTurnClock(100, 0).due(99)).toBeUndefined();
  });

  it("reports each turn at its scheduled moment, not when it was noticed", () => {
    const clock = createTurnClock(100, 0);
    expect(clock.due(116)).toBe(100);
    expect(clock.due(150)).toBeUndefined();
    expect(clock.due(203)).toBe(200);
  });

  it("plays one catch-up turn after a stall, then resumes its pace, rather than replaying the missed turns", () => {
    const clock = createTurnClock(100, 0);
    expect(clock.due(1000)).toBe(100);
    expect(clock.due(1001)).toBe(1000);
    expect(clock.due(1050)).toBeUndefined();
    expect(clock.due(1100)).toBe(1100);
  });
});
