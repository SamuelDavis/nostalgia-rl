import { describe, expect, it } from "vitest";
import { SEA_LEVEL, heightLevel } from "./constants";
import { createFields } from "./fields";
import { traceRiver } from "./rivers";

const seeds = [1, 2, 3];
const regions = Array.from({ length: 81 }, (_, i) => ({
  cx: (i % 9) - 4,
  cy: Math.floor(i / 9) - 4,
}));

const riversFor = (seed: number) => {
  const fields = createFields(seed);
  return regions.flatMap(({ cx, cy }) => traceRiver(seed, fields, cx, cy) ?? []);
};

describe("traceRiver", () => {
  it("produces rivers for typical seeds", () => {
    for (const seed of seeds) expect(riversFor(seed).length).toBeGreaterThan(5);
  });

  it("is deterministic", () => {
    const fields = createFields(1);
    const a = regions.map(({ cx, cy }) => traceRiver(1, fields, cx, cy));
    const b = regions.map(({ cx, cy }) => traceRiver(1, createFields(1), cx, cy));
    expect(a).toEqual(b);
  });

  it("never flows uphill", () => {
    for (const seed of seeds)
      for (const river of riversFor(seed))
        river.nodes.forEach((node, i) => {
          if (i > 0) expect(node.level).toBeLessThanOrEqual(river.nodes[i - 1]!.level);
        });
  });

  it("ends in the sea or a lake", () => {
    for (const seed of seeds) {
      const fields = createFields(seed);
      for (const river of riversFor(seed)) {
        const mouth = river.nodes.at(-1)!;
        if (river.lake === undefined) expect(heightLevel(fields.elevation(mouth.x, mouth.y))).toBeLessThan(SEA_LEVEL);
        else expect(river.lake.level).toBe(mouth.level);
      }
    }
  });

  it("widens downstream", () => {
    for (const river of riversFor(1)) {
      const widths = river.nodes.map((n) => n.halfWidth);
      expect(widths).toEqual([...widths].sort((a, b) => a - b));
    }
  });
});
