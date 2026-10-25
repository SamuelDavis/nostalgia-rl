import { describe, expect, it } from "vitest";
import { actionFor, createDirectionInput } from "./directions";
import { Heading } from "../game/movement";

const REPEAT_DELAY = 250;

describe("createDirectionInput", () => {
  it("yields nothing when idle", () => {
    expect(createDirectionInput(REPEAT_DELAY).take(0)).toBeUndefined();
  });

  it("acts once on a tap released before the turn", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Heading.East, 0);
    input.release(Heading.East);
    expect(input.take(50)?.heading).toBe(Heading.East);
    expect(input.take(150)?.heading).toBeUndefined();
  });

  it("acts once on a tap still held across turns shorter than the repeat delay", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Heading.East, 0);
    expect(input.take(50)).toEqual({ heading: Heading.East, isRepeat: false });
    expect(input.take(150)?.heading).toBeUndefined();
    expect(input.take(REPEAT_DELAY - 1)?.heading).toBeUndefined();
  });

  it("repeats every turn once held past the repeat delay", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Heading.North, 0);
    input.take(50);
    expect([input.take(REPEAT_DELAY), input.take(REPEAT_DELAY + 100)]).toEqual([
      { heading: Heading.North, isRepeat: true },
      { heading: Heading.North, isRepeat: true },
    ]);
  });

  it("keeps only the latest tap between turns", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Heading.North, 0);
    input.release(Heading.North);
    input.press(Heading.West, 10);
    input.release(Heading.West);
    expect(input.take(50)?.heading).toBe(Heading.West);
  });

  it("follows the most recently pressed of opposite held keys, falling back on release", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Heading.West, 0);
    input.take(50);
    input.press(Heading.East, 1000);
    expect(input.take(1050)?.heading).toBe(Heading.East);
    input.release(Heading.East);
    expect(input.take(1150)?.heading).toBe(Heading.West);
  });
});

describe("createDirectionInput on two axes", () => {
  it("taps the diagonal of a key pressed while another is held", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Heading.North, 0);
    expect(input.take(10)?.heading).toBe(Heading.North);
    input.press(Heading.East, 20);
    expect(input.take(30)).toEqual({ heading: Heading.NorthEast, isRepeat: false });
  });

  it("holds the diagonal of keys held on both axes, the latest winning on each", () => {
    const input = createDirectionInput(REPEAT_DELAY);
    input.press(Heading.West, 0);
    input.press(Heading.South, 0);
    input.press(Heading.East, 0);
    input.take(10);
    expect(input.take(REPEAT_DELAY)?.heading).toBe(Heading.SouthEast);
    input.release(Heading.East);
    expect(input.take(REPEAT_DELAY + 10)?.heading).toBe(Heading.SouthWest);
  });
});

describe("actionFor", () => {
  const tap = (heading: Heading) => ({ heading, isRepeat: false });
  const repeat = (heading: Heading) => ({ heading, isRepeat: true });

  it("steps whichever way is pressed when taps step", () => {
    expect(actionFor(tap(Heading.North), Heading.East, false)).toEqual({
      kind: "step",
      heading: Heading.North,
    });
  });

  it("keeps pushing whichever way is held", () => {
    expect(actionFor(repeat(Heading.North), Heading.East, false)).toEqual({
      kind: "push",
      heading: Heading.North,
    });
  });

  describe("when taps turn first", () => {
    it("turns on a tap in a new direction", () => {
      expect(actionFor(tap(Heading.North), Heading.East, true)).toEqual({
        kind: "face",
        heading: Heading.North,
      });
    });

    it("steps at once on a tap in the facing direction", () => {
      expect(actionFor(tap(Heading.East), Heading.East, true)).toEqual({ kind: "step", heading: Heading.East });
    });

    it("pushes on a held key", () => {
      expect(actionFor(repeat(Heading.North), Heading.East, true)).toEqual({
        kind: "push",
        heading: Heading.North,
      });
    });
  });
});
