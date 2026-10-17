import { describe, expect, it } from "vitest";
import { Biome, Cover, Ground, Prop, Water, Way } from "../terrain";
import { type FeatureType, type TileDraft, paintInOrder, place } from "./feature";

const draft = (): TileDraft => ({
  height: 100,
  ground: Ground.Grass,
  water: Water.None,
  prop: Prop.None,
  way: Way.None,
  cover: Cover.None,
  biome: Biome.Grassland,
});

const stamping = (
  name: string,
  priority: number,
  prop: Prop,
  builds: string[],
): FeatureType<{ x: number; y: number; id: number }, Prop> => ({
  name,
  priority,
  reach: 1,
  build: () => {
    builds.push(name);
    return prop;
  },
  paint: (stamp, tile, x) => {
    if (x !== 0) return false;
    tile.prop = stamp;
    return true;
  },
});

describe("features", () => {
  it("build their layout once per placement", () => {
    const builds: string[] = [];
    const tent = place(stamping("tent", 0, Prop.Tent, builds), { x: 0, y: 0, id: 1 });
    tent.paint(draft(), 0, 0);
    tent.paint(draft(), 0, 0);
    expect(builds).toEqual(["tent"]);
  });

  it("paint in order, later features over earlier ones", () => {
    const builds: string[] = [];
    const low = place(stamping("low", 0, Prop.Tent, builds), { x: 0, y: 0, id: 1 });
    const high = place(stamping("high", 1, Prop.Campfire, builds), { x: 0, y: 0, id: 2 });
    const tile = draft();
    expect(paintInOrder([low, high], tile, 0, 0)).toBe(true);
    expect(tile.prop).toBe(Prop.Campfire);
  });

  it("leave tiles outside every footprint unclaimed", () => {
    const tent = place(stamping("tent", 0, Prop.Tent, []), { x: 0, y: 0, id: 1 });
    const tile = draft();
    expect(paintInOrder([tent], tile, 5, 0)).toBe(false);
    expect(tile).toEqual(draft());
  });
});
