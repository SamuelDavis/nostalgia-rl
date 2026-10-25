import { describe, expect, it } from "vitest";
import { describePurpose } from "./debug";

describe("describePurpose", () => {
  it("names the role and who occupies it", () => {
    expect(describePurpose({ role: "lair", occupants: ["beasts"], produces: [] })).toBe("lair of beasts");
  });

  it("adds what it produces and what it relates to", () => {
    expect(
      describePurpose({
        role: "worksite",
        occupants: ["woodcutter"],
        produces: ["timber"],
        relation: { kind: "supplies", target: { x: 4, y: -2 } },
      }),
    ).toBe("worksite of woodcutter, makes timber, supplies 4, -2");
  });

  it("is just the role when nothing lives there", () => {
    expect(describePurpose({ role: "shrine", occupants: [], produces: [] })).toBe("shrine");
  });
});
