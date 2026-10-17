import { describe, expect, it } from "vitest";
import { createDirectionInput } from "./input";
import { Direction } from "./movement";

const REPEAT_DELAY = 250;

describe("createDirectionInput", () => {
  it("yields nothing when idle", () => {
    expect(createDirectionInput(REPEAT_DELAY).take(0)).toBeUndefined();
  });

  it("acts once on a tap released before the turn", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.East, 0);
    input.release(Direction.East);
    expect(input.take(50)).toBe(Direction.East);
    expect(input.take(150)).toBeUndefined();
  });

  it("acts once on a tap still held across turns shorter than the repeat delay", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.East, 0);
    expect(input.take(50)).toBe(Direction.East);
    expect(input.take(150)).toBeUndefined();
    expect(input.take(REPEAT_DELAY - 1)).toBeUndefined();
  });

  it("repeats every turn once held past the repeat delay", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.North, 0);
    input.take(50);
    expect([input.take(REPEAT_DELAY), input.take(REPEAT_DELAY + 100)]).toEqual([Direction.North, Direction.North]);
  });

  it("keeps only the latest tap between turns", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.North, 0);
    input.release(Direction.North);
    input.press(Direction.West, 10);
    input.release(Direction.West);
    expect(input.take(50)).toBe(Direction.West);
  });

  it("follows the most recently pressed held key, falling back on release", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.West, 0);
    input.take(50);
    input.press(Direction.South, 1000);
    expect(input.take(1050)).toBe(Direction.South);
    input.release(Direction.South);
    expect(input.take(1150)).toBe(Direction.West);
  });
});
