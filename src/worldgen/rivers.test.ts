import { describe, expect, it } from "vitest";
import { memoize } from "procgen";
import { SEA_LEVEL, heightLevel } from "./constants";
import { regions } from "./region";
import type { River } from "./rivers";
import { createWorldgen } from "./world";

const seeds = [1, 2, 3];
const ORIGIN = { col: 0, row: 0 };
const nearby = regions.cellsAround(ORIGIN, 3);

const worldOf = memoize(createWorldgen, String, 4);
const riversOf = (seed: number, within = nearby) => [...new Set(within.flatMap(worldOf(seed).riversNear))];
const inner = regions.cellsAround(ORIGIN, 1);

const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;

describe("rivers", () => {
  it("are common on typical seeds", () => {
    for (const seed of seeds) expect(riversOf(seed).length).toBeGreaterThan(40);
  });

  it("are deterministic", () => {
    const a = createWorldgen(1);
    const b = createWorldgen(1);
    b.riversNear({ col: 5, row: 5 });
    expect(b.riversNear(ORIGIN)).toEqual(a.riversNear(ORIGIN));
  });

  it("never flow uphill", () => {
    for (const seed of seeds)
      for (const river of riversOf(seed))
        river.nodes.forEach((node, i) => {
          if (i > 0) expect(node.level).toBeLessThanOrEqual(river.nodes[i - 1]!.level);
        });
  });

  it("flow on into another river, the sea or a lake", () => {
    for (const seed of seeds) {
      const { fields } = worldOf(seed);
      const rivers = riversOf(seed);
      const starts = new Map<string, River>(rivers.flatMap((r) => (r.nodes[0] ? [[key(r.nodes[0]), r]] : [])));
      const lakes = new Set(rivers.flatMap((r) => (r.lake ? [key(r.lake)] : [])));
      for (const river of riversOf(seed, inner)) {
        if (river.nodes.length === 0) {
          expect(river.lake).toBeDefined();
          continue;
        }
        const mouth = river.nodes.at(-1)!;
        const next = starts.get(key(mouth));
        const isSea = heightLevel(fields.elevation(mouth.x, mouth.y)) < SEA_LEVEL;
        expect(next !== undefined || isSea || lakes.has(key(mouth)), `mouth at ${key(mouth)}`).toBe(true);
        if (next) expect(next.nodes[0]!.level).toBe(mouth.level);
      }
    }
  });

  it("never narrow downstream", () => {
    for (const seed of seeds) {
      const rivers = riversOf(seed);
      const starts = new Map(rivers.flatMap((r) => (r.nodes[0] ? [[key(r.nodes[0]), r]] : [])));
      for (const river of riversOf(seed, inner)) {
        const next = river.nodes.length > 0 ? starts.get(key(river.nodes.at(-1)!)) : undefined;
        if (next) expect(next.nodes[0]!.halfWidth).toBeGreaterThanOrEqual(river.nodes[0]!.halfWidth);
      }
    }
  });
});
