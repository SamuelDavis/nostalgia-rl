import { describe, expect, it } from "vitest";
import { actionFor, createDirectionInput } from "./input";
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
    expect(input.take(50)?.direction).toBe(Direction.East);
    expect(input.take(150)?.direction).toBeUndefined();
  });

  it("acts once on a tap still held across turns shorter than the repeat delay", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.East, 0);
    expect(input.take(50)).toEqual({ direction: Direction.East, isRepeat: false });
    expect(input.take(150)?.direction).toBeUndefined();
    expect(input.take(REPEAT_DELAY - 1)?.direction).toBeUndefined();
  });

  it("repeats every turn once held past the repeat delay", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.North, 0);
    input.take(50);
    expect([input.take(REPEAT_DELAY), input.take(REPEAT_DELAY + 100)]).toEqual([
      { direction: Direction.North, isRepeat: true },
      { direction: Direction.North, isRepeat: true },
    ]);
  });

  it("keeps only the latest tap between turns", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.North, 0);
    input.release(Direction.North);
    input.press(Direction.West, 10);
    input.release(Direction.West);
    expect(input.take(50)?.direction).toBe(Direction.West);
  });

  it("follows the most recently pressed held key, falling back on release", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Direction.West, 0);
    input.take(50);
    input.press(Direction.South, 1000);
    expect(input.take(1050)?.direction).toBe(Direction.South);
    input.release(Direction.South);
    expect(input.take(1150)?.direction).toBe(Direction.West);
  });
});

describe("actionFor", () => {
  const tap = (direction: Direction) => ({ direction, isRepeat: false });
  const repeat = (direction: Direction) => ({ direction, isRepeat: true });

  it("steps whichever way is pressed when taps step", () => {
    expect(actionFor(tap(Direction.North), Direction.East, false)).toEqual({
      kind: "step",
      direction: Direction.North,
    });
  });

  describe("when taps turn first", () => {
    it("turns on a tap in a new direction", () => {
      expect(actionFor(tap(Direction.North), Direction.East, true)).toEqual({
        kind: "face",
        direction: Direction.North,
      });
    });

    it("steps at once on a tap in the facing direction", () => {
      expect(actionFor(tap(Direction.East), Direction.East, true)).toEqual({ kind: "step", direction: Direction.East });
    });

    it("steps on a held key", () => {
      expect(actionFor(repeat(Direction.North), Direction.East, true)).toEqual({
        kind: "step",
        direction: Direction.North,
      });
    });
  });
});
