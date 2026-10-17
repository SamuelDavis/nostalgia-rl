import { describe, expect, it } from "vitest";
import { createGlide } from "./motion";

const DURATION = 100;

describe("createGlide", () => {
  it("shows a still subject where it stands", () => {
    const glide = createGlide(DURATION, { x: 3, y: 4 });
    expect(glide.shownAt(0)).toEqual({ x: 3, y: 4 });
  });

  it("glides to a new tile over the duration from when the move was scheduled", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    glide.moveTo({ x: 1, y: 0 }, 1000);
    expect(glide.shownAt(1000)).toEqual({ x: 0, y: 0 });
    expect(glide.shownAt(1050)).toEqual({ x: 0.5, y: 0 });
    expect(glide.shownAt(1100)).toEqual({ x: 1, y: 0 });
    expect(glide.shownAt(2000)).toEqual({ x: 1, y: 0 });
  });

  it("keeps a steady pace across back-to-back moves processed late", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    glide.moveTo({ x: 1, y: 0 }, 0);
    glide.moveTo({ x: 2, y: 0 }, 100);
    expect(glide.shownAt(116)).toEqual({ x: 1.16, y: 0 });
  });

  it("turns mid-glide from where it is shown, without jumping", () => {
    const glide = createGlide(DURATION, { x: 0, y: 0 });
    glide.moveTo({ x: 1, y: 0 }, 0);
    glide.moveTo({ x: 1, y: 1 }, 50);
    expect(glide.shownAt(50)).toEqual({ x: 0.5, y: 0 });
    expect(glide.shownAt(150)).toEqual({ x: 1, y: 1 });
  });
});
