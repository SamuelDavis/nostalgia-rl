import { describe, expect, it } from "vitest";
import { memoize } from "procgen";
import { SURFACE } from "../../layer";
import { regions } from "../../region";
import { cavesWithWayness } from "./fixture";

const cavesOf = memoize((seed: number) => cavesWithWayness(seed, 0).caves, String, 2);

describe("caves", () => {
  const caves = cavesOf(1);
  const cave = regions
    .cellsAround({ col: 0, row: 0 }, 3)
    .flatMap(caves.cavesIn)
    .find((c) => caves.planOf(c).bottom < 0)!;
  const plan = caves.planOf(cave);
  const top = { cave, floor: 0 };

  it("links the surface outside the mouth to the top of the cave and back", () => {
    const { inside, outside } = plan.mouth;
    expect(caves.linkAcross(SURFACE, outside, inside)).toEqual(top);
    expect(caves.linkAcross(top, inside, outside)).toBe(SURFACE);
    expect(caves.linkAcross(SURFACE, inside, outside)).toBeUndefined();
  });

  it("links a ramp's halves to the floors above and below", () => {
    const ramp = caves.rampBelow(cave, 0)!;
    const [upper, lower] = [ramp.tiles[ramp.link - 1]!, ramp.tiles[ramp.link]!];
    expect(caves.linkAcross(top, upper, lower)).toEqual({ cave, floor: -1 });
    expect(caves.linkAcross({ cave, floor: -1 }, lower, upper)).toEqual(top);
    expect(caves.linkAcross(top, lower, upper)).toBeUndefined();
  });

  it("lists mouths as openings of the regions their caves are in", () => {
    expect(caves.openingsIn(cave.region)).toContainEqual({ inside: plan.mouth.inside, outside: plan.mouth.outside });
  });
});
