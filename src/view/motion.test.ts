import { describe, expect, it } from "vitest";
import { createGlide } from "./motion";

const DURATION = 100;

describe("createGlide", () => {
  it("shows a still subject where it stands", () => {
    const shown = createGlide(DURATION, { x: 3, y: 4 });
    expect(shown({ x: 3, y: 4 }, 0)).toEqual({ x: 3, y: 4 });
  });

  it("glides to a new tile over the duration", () => {
    const shown = createGlide(DURATION, { x: 0, y: 0 });
    expect(shown({ x: 1, y: 0 }, 1000)).toEqual({ x: 0, y: 0 });
    expect(shown({ x: 1, y: 0 }, 1050)).toEqual({ x: 0.5, y: 0 });
    expect(shown({ x: 1, y: 0 }, 1100)).toEqual({ x: 1, y: 0 });
    expect(shown({ x: 1, y: 0 }, 2000)).toEqual({ x: 1, y: 0 });
  });

  it("turns mid-glide from where it is shown, without jumping", () => {
    const shown = createGlide(DURATION, { x: 0, y: 0 });
    shown({ x: 1, y: 0 }, 0);
    expect(shown({ x: 1, y: 1 }, 50)).toEqual({ x: 0.5, y: 0 });
    expect(shown({ x: 1, y: 1 }, 150)).toEqual({ x: 1, y: 1 });
  });
});
