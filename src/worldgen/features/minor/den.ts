import { distance } from "procgen";
import { FOREST_THRESHOLD } from "../../biome";
import { metresToLevels } from "../../constants";
import { Biome, Ground, Prop, Water } from "../../terrain";
import { settle } from "../feature";
import { Occupant, Role } from "../purpose";
import { CARDINALS, type MinorDesign, centreOf, gapFrom, isFlat, medianLevel, ringAround } from "./kind";

const RADIUS = 6;
const HOLLOW = 3.5;
const WALL = 4.5;
const OPENING = 1.6;
const BONES = 3;
const SCRUB = 0.25;
const FLATNESS = metresToLevels(4);
const LANDS: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest, Biome.Desert, Biome.Mountain]);

export const den: MinorDesign = {
  radius: RADIUS,
  fits: (p, land) =>
    LANDS.has(land.biomeAt(p)) &&
    land.conditions(p).forestness >= FOREST_THRESHOLD - SCRUB &&
    isFlat(land, p, 4, FLATNESS),
  build: (site, land, _, rng) => {
    const level = medianLevel(land, ringAround(site, HOLLOW));
    const out = CARDINALS[rng.int(0, CARDINALS.length - 1, 0)]!;
    const mouth = { x: site.x + 0.5 + out.x * WALL, y: site.y + 0.5 + out.y * WALL };
    const bones = Array.from({ length: BONES }, (_, i) => ({
      x: site.x + rng.int(-2, 2, 1, i),
      y: site.y + rng.int(-2, 2, 2, i),
    }));
    return {
      purpose: { role: Role.Lair, occupants: [Occupant.Beasts], produces: [] },
      buildings: [],
      paint: (draft, x, y) => {
        const gap = gapFrom(site, x, y);
        if (gap > RADIUS) return false;
        draft.height = settle(draft.height, level, gap - HOLLOW);
        draft.water = Water.None;
        draft.part = 0;
        if (gap <= HOLLOW) {
          draft.ground = Ground.Dirt;
          draft.prop = bones.some((b) => b.x === x && b.y === y) ? Prop.Bones : Prop.None;
        } else if (gap <= WALL + 0.5 && distance(centreOf({ x, y }), mouth) > OPENING)
          draft.prop = rng.chance(0.5, x, y) ? Prop.Boulder : Prop.Bush;
        else draft.prop = Prop.None;
        return true;
      },
    };
  },
};
