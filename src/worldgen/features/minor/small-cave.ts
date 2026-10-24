import { type Vec2, distance } from "procgen";
import { metresToLevels } from "../../constants";
import { Biome, Cover, Ground, Prop, Water } from "../../terrain";
import { settle } from "../feature";
import { Role } from "../purpose";
import { CARDINALS, type MinorDesign, centreOf, gapFrom } from "./kind";

const RADIUS = 9;
const MOUND = 5.5;
const CHAMBER = 2.5;
const INSET = 3;
const PROBE = 6;
const RISE = metresToLevels(3);
const LANDS: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest, Biome.Desert, Biome.Mountain]);

const uphillOf = (p: Vec2, level: (p: Vec2) => number): Vec2 =>
  CARDINALS.reduce((best, d) =>
    level({ x: p.x + d.x * PROBE, y: p.y + d.y * PROBE }) > level({ x: p.x + best.x * PROBE, y: p.y + best.y * PROBE })
      ? d
      : best,
  );

export const smallCave: MinorDesign = {
  radius: RADIUS,
  fits: (p, land) => {
    if (!LANDS.has(land.biomeAt(p))) return false;
    const up = uphillOf(p, land.level);
    return land.level({ x: p.x + up.x * PROBE, y: p.y + up.y * PROBE }) - land.level(p) >= RISE;
  },
  build: (site, land) => {
    const level = land.level(site);
    const up = uphillOf(site, land.level);
    const chamber = { x: site.x + up.x * INSET, y: site.y + up.y * INSET };
    const passage = Array.from({ length: Math.ceil(MOUND) + 1 }, (_, i) => ({
      x: chamber.x - up.x * i,
      y: chamber.y - up.y * i,
    }));
    const mouth = passage.at(-1)!;
    const cache = { x: chamber.x + up.x * 2, y: chamber.y + up.y * 2 };
    const isPassage = (x: number, y: number) => passage.some((p) => p.x === x && p.y === y);
    return {
      purpose: { role: Role.Shelter, occupants: [], produces: [] },
      buildings: [],
      paint: (draft, x, y) => {
        const gap = gapFrom(site, x, y);
        if (gap > RADIUS) return false;
        const fromChamber = distance(centreOf({ x, y }), centreOf(chamber));
        draft.water = Water.None;
        draft.part = 0;
        if (fromChamber <= CHAMBER || (fromChamber <= MOUND && isPassage(x, y))) {
          draft.height = level;
          draft.ground = Ground.Rock;
          draft.prop = x === cache.x && y === cache.y ? Prop.Crate : Prop.None;
          draft.cover = x === mouth.x && y === mouth.y ? Cover.None : Cover.Rock;
          return true;
        }
        if (fromChamber <= MOUND) {
          draft.height = Math.max(draft.height, level);
          draft.prop = Prop.Rock;
          draft.cover = Cover.Rock;
          return true;
        }
        draft.height = settle(draft.height, level, fromChamber - MOUND);
        if (isPassage(x, y)) draft.prop = Prop.None;
        return true;
      },
    };
  },
};
