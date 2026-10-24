import { describe, expect, it } from "vitest";
import { floorDiv, memoize } from "procgen";
import { tileIndex } from "../../chunk";
import { generateChunk } from "../../world";
import { CHUNK_SIZE } from "../../constants";
import { partOf, tilesOf } from "../../props";
import { regions } from "../../region";
import { Prop, Way } from "../../terrain";
import { createWorldgen } from "../../world";
import { BIG_MINE_FLOORS, MEDIUM_MINE_FLOORS } from "./yard";

const worldOf = memoize(createWorldgen, String, 4);
const chunkOf = memoize(
  ({ seed, cx, cy }: { seed: number; cx: number; cy: number }) => generateChunk(worldOf(seed), cx, cy),
  ({ seed, cx, cy }) => `${seed},${cx},${cy}`,
  256,
);
const tileAt = (seed: number, x: number, y: number) => {
  const chunk = chunkOf({ seed, cx: floorDiv(x, CHUNK_SIZE), cy: floorDiv(y, CHUNK_SIZE) });
  const i = tileIndex(x - chunk.cx * CHUNK_SIZE, y - chunk.cy * CHUNK_SIZE);
  return {
    height: chunk.height[i]!,
    ground: chunk.ground[i]!,
    prop: chunk.prop[i]!,
    part: chunk.part[i]!,
    way: chunk.way[i]!,
  };
};

const SEEDS = [1, 2, 3];
const yardsOf = (seed: number) =>
  [...new Set(regions.cellsAround({ col: 0, row: 0 }, 4).flatMap(worldOf(seed).mineYardsIn))].map(
    ({ layout }) => layout,
  );

describe("mine yards", () => {
  it("levels a terrace at the portal's level in front of every mine", { tags: "slow" }, () => {
    for (const seed of SEEDS)
      for (const { mouth, half, depth } of yardsOf(seed)) {
        const outward = { x: mouth.outside.x - mouth.inside.x, y: mouth.outside.y - mouth.inside.y };
        const lateral = { x: -outward.y, y: outward.x };
        for (let v = 1; v <= depth; v++)
          for (let u = -half; u <= half; u++) {
            const x = mouth.inside.x + lateral.x * u + outward.x * v;
            const y = mouth.inside.y + lateral.y * u + outward.y * v;
            expect(tileAt(seed, x, y).height, `yard at ${mouth.outside.x},${mouth.outside.y}`).toBe(mouth.level);
          }
      }
  });

  it("scales each yard to its mine: a fire and maybe a tent at small ones, stores and lodging at big ones", () => {
    const yards = [1, 2, 3, 4, 5, 6].flatMap(yardsOf);
    const kindsOf = (yard: (typeof yards)[number]) => yard.props.map(({ kind }) => kind);
    const areaOf = ({ half, depth }: (typeof yards)[number]) => (2 * half + 1) * depth;
    const small = yards.filter(({ floors }) => floors < MEDIUM_MINE_FLOORS);
    const big = yards.filter(({ floors }) => floors >= BIG_MINE_FLOORS);
    for (const yard of small)
      expect(kindsOf(yard).every((kind) => kind === Prop.Campfire || kind === Prop.Tent)).toBe(true);
    expect(small.some((yard) => kindsOf(yard).includes(Prop.Tent))).toBe(true);
    expect(small.some((yard) => !kindsOf(yard).includes(Prop.Tent))).toBe(true);
    for (const kind of [Prop.Stockpile, Prop.Shed, Prop.Bunkhouse])
      expect(big.some((yard) => kindsOf(yard).includes(kind))).toBe(true);
    expect(yards.filter((yard) => kindsOf(yard).includes(Prop.Campfire)).length / yards.length).toBeGreaterThan(0.9);
    expect(Math.max(...small.map(areaOf))).toBeLessThan(Math.min(...big.map(areaOf)));
  });

  it("builds every prop whole and off the ways", { tags: "slow" }, () => {
    for (const seed of SEEDS)
      for (const { props } of yardsOf(seed))
        for (const prop of props)
          for (const p of tilesOf(prop)) {
            const tile = tileAt(seed, p.x, p.y);
            expect(tile.prop).toBe(prop.kind);
            expect(tile.part).toBe(partOf(prop, p));
            expect(tile.way).toBe(Way.None);
          }
  });
});
