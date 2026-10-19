import { describe, expect, it } from "vitest";
import { footprints } from "./props";

const Prop = { Rock: 0, Tent: 1 } as const;
type Prop = (typeof Prop)[keyof typeof Prop];
const { sizeOf, tilesOf, partOf, fits } = footprints<Prop>({ [Prop.Tent]: { x: 2, y: 3 } });

describe("footprints", () => {
  const tent = { kind: Prop.Tent, at: { x: 10, y: -5 } };

  it("default to one tile", () => {
    expect(sizeOf(Prop.Rock)).toEqual({ x: 1, y: 1 });
    expect(tilesOf({ kind: Prop.Rock, at: { x: 3, y: 4 } })).toEqual([{ x: 3, y: 4 }]);
  });

  it("number their tiles row-major from the anchor", () => {
    expect(tilesOf(tent)).toHaveLength(6);
    expect(tilesOf(tent).map((p) => partOf(tent, p))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(partOf(tent, { x: 12, y: -5 })).toBeUndefined();
  });

  it("fit only where every tile is free", () => {
    expect(fits(tent, () => true)).toBe(true);
    expect(fits(tent, (p) => !(p.x === 11 && p.y === -3))).toBe(false);
  });
});
