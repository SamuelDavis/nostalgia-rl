import { describe, expect, it } from "vitest";
import { createDirectionInput } from "./input";
import { Direction } from "./movement";

describe("createDirectionInput", () => {
  it("yields nothing when idle", () => {
    expect(createDirectionInput().take()).toBeUndefined();
  });

  it("acts once on a tap released before the turn", () => {
    const input = createDirectionInput();
    input.press(Direction.East);
    input.release(Direction.East);
    expect(input.take()).toBe(Direction.East);
    expect(input.take()).toBeUndefined();
  });

  it("repeats every turn while held", () => {
    const input = createDirectionInput();
    input.press(Direction.North);
    expect([input.take(), input.take()]).toEqual([Direction.North, Direction.North]);
  });

  it("keeps only the latest tap between turns", () => {
    const input = createDirectionInput();
    input.press(Direction.North);
    input.release(Direction.North);
    input.press(Direction.West);
    input.release(Direction.West);
    expect(input.take()).toBe(Direction.West);
  });

  it("follows the most recently pressed held key, falling back on release", () => {
    const input = createDirectionInput();
    input.press(Direction.West);
    input.press(Direction.South);
    expect(input.take()).toBe(Direction.South);
    input.release(Direction.South);
    expect(input.take()).toBe(Direction.West);
  });
});
