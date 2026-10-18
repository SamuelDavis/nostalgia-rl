import { describe, expect, it } from "vitest";
import { footprintOf, partOf, tilesOf } from "./props";
import { Prop } from "./terrain";

describe("props", () => {
  it("sizes a tent to scale and most props to a tile", () => {
    expect(footprintOf(Prop.Tent)).toEqual({ x: 2, y: 2 });
    expect(footprintOf(Prop.Campfire)).toEqual({ x: 1, y: 1 });
  });

  it("numbers a prop's parts row by row from its anchor", () => {
    const tent = { kind: Prop.Tent, at: { x: 10, y: 20 } };
    expect(tilesOf(tent)).toEqual([
      { x: 10, y: 20 },
      { x: 11, y: 20 },
      { x: 10, y: 21 },
      { x: 11, y: 21 },
    ]);
    expect(tilesOf(tent).map((p) => partOf(tent, p))).toEqual([0, 1, 2, 3]);
    expect(partOf(tent, { x: 12, y: 20 })).toBeUndefined();
  });
});
