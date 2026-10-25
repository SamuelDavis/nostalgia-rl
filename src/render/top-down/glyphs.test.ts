import { describe, expect, it } from "vitest";
import { Prop, footprintOf } from "../../worldgen";
import { propGlyph } from "./glyphs";

describe("prop glyphs", () => {
  it("draws every part of a prop", () => {
    for (const prop of Object.values(Prop).filter((p) => propGlyph[p] !== "")) {
      const { x, y } = footprintOf(prop);
      expect([...propGlyph[prop]], `prop ${prop}`).toHaveLength(x * y);
    }
  });
});
