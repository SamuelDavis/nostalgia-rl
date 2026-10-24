import { cos, sin } from "procgen";
import { metresToLevels } from "../../constants";
import { Biome, Prop, Water } from "../../terrain";
import { settle } from "../feature";
import { Role } from "../purpose";
import { type MinorDesign, gapFrom, isFlat, medianLevel, ringAround } from "./kind";

const RADIUS = 7;
const CIRCLE = 4.5;
const STONES = 10;
const FALLEN = 0.2;
const FLOWERS = 0.15;
const FLATNESS = metresToLevels(3);
const LANDS: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest, Biome.Desert, Biome.Beach]);

export const standingStones: MinorDesign = {
  radius: RADIUS,
  fits: (p, land) => LANDS.has(land.biomeAt(p)) && isFlat(land, p, 5, FLATNESS),
  build: (site, land, _, rng) => {
    const level = medianLevel(land, ringAround(site, CIRCLE));
    const stones = Array.from({ length: STONES }, (_, i) => {
      const angle = (i / STONES) * 2 * Math.PI;
      return { x: site.x + Math.round(cos(angle) * CIRCLE), y: site.y + Math.round(sin(angle) * CIRCLE) };
    }).filter((_, i) => !rng.chance(FALLEN, 0, i));
    return {
      purpose: { role: Role.Shrine, occupants: [], produces: [] },
      buildings: [],
      paint: (draft, x, y) => {
        const gap = gapFrom(site, x, y);
        if (gap > RADIUS) return false;
        draft.height = settle(draft.height, level, gap - CIRCLE);
        draft.water = Water.None;
        draft.part = 0;
        if (x === site.x && y === site.y) draft.prop = Prop.Altar;
        else if (stones.some((s) => s.x === x && s.y === y)) draft.prop = Prop.StandingStone;
        else draft.prop = gap <= CIRCLE && rng.chance(FLOWERS, x, y) ? Prop.Flowers : Prop.None;
        return true;
      },
    };
  },
};
