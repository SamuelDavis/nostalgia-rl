import { describe, expect, it } from "vitest";
import { floorDiv } from "procgen";
import { CHUNK_SIZE } from "../../worldgen";
import { pointAt } from "./frame";
import { chunksUnder } from "./local";

const keyOf = (cx: number, cy: number) => `${cx},${cy}`;

const chunksShaded = (frame: Parameters<typeof chunksUnder>[0]) => {
  const keys = new Set<string>();
  const { x: left, y: top } = pointAt(frame, 0, 0);
  for (let y = top - 1; y < top + frame.size; y++)
    for (let x = left - 1; x < left + frame.size; x++)
      keys.add(keyOf(floorDiv(x, CHUNK_SIZE), floorDiv(y, CHUNK_SIZE)));
  return keys;
};

describe("chunksUnder", () => {
  it.each([
    { x: 0, y: 0 },
    { x: 17, y: -5 },
    { x: -33, y: 96 },
  ])(
    "is exactly the chunks a local map around $x,$y reads, its own tiles and the row and column it shades from",
    (center) => {
      const frame = { center, size: 256, scale: 1 };
      const chunks = chunksUnder(frame).map(({ cx, cy }) => keyOf(cx, cy));
      expect(new Set(chunks)).toEqual(chunksShaded(frame));
      expect(chunks).toHaveLength(new Set(chunks).size);
    },
  );
});
