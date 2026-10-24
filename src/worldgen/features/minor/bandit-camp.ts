import { distance } from "procgen";
import { metresToLevels } from "../../constants";
import { type PlacedProp, partOf } from "../../props";
import { Biome, Ground, Prop, Water } from "../../terrain";
import { nearestWayPoint } from "../../ways";
import { settle } from "../feature";
import { Occupant, Role } from "../purpose";
import { type MinorDesign, gapFrom, isFlat, medianLevel, ringAround } from "./kind";

const RADIUS = 11;
const YARD = 7;
const PALISADE = 8;
const GATE = 2.5;
const FLATNESS = metresToLevels(3);
const LANDS: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest, Biome.Desert]);
const TENT_SPOTS = [
  { x: 2, y: -4 },
  { x: -5, y: -2 },
  { x: -3, y: 2 },
  { x: 2, y: 2 },
];
const CRATE_SPOTS = [
  { x: 4, y: 0 },
  { x: -1, y: -4 },
  { x: 0, y: 4 },
];

export const banditCamp: MinorDesign = {
  radius: RADIUS,
  fits: (p, land) => LANDS.has(land.biomeAt(p)) && isFlat(land, p, 6, FLATNESS),
  build: (site, land, { ways }, rng) => {
    const level = medianLevel(land, ringAround(site, YARD));
    const prey = nearestWayPoint(ways, site);
    const toward =
      prey && (prey.at.x !== site.x || prey.at.y !== site.y)
        ? { x: prey.at.x - site.x, y: prey.at.y - site.y }
        : { x: 0, y: 1 };
    const length = Math.sqrt(toward.x * toward.x + toward.y * toward.y);
    const gate = { x: site.x + (toward.x / length) * PALISADE, y: site.y + (toward.y / length) * PALISADE };
    const tents = rng
      .shuffle(TENT_SPOTS, 0)
      .slice(0, rng.int(2, 3, 1))
      .map((o): PlacedProp => ({ kind: Prop.Tent, at: { x: site.x + o.x, y: site.y + o.y } }));
    const crates = CRATE_SPOTS.filter((_, i) => rng.chance(0.6, 2, i)).map((o) => ({
      x: site.x + o.x,
      y: site.y + o.y,
    }));
    return {
      purpose: {
        role: Role.Hideout,
        occupants: [Occupant.Bandits],
        produces: [],
        ...(prey ? { relation: { kind: "preys on" as const, target: prey.at } } : {}),
      },
      buildings: [],
      paint: (draft, x, y) => {
        const gap = gapFrom(site, x, y);
        if (gap > RADIUS) return false;
        draft.height = settle(draft.height, level, gap - YARD);
        draft.water = Water.None;
        draft.prop = Prop.None;
        draft.part = 0;
        if (gap <= YARD) draft.ground = Ground.Dirt;
        const tent = tents.find((t) => partOf(t, { x, y }) !== undefined);
        if (x === site.x && y === site.y) draft.prop = Prop.Campfire;
        else if (tent) {
          draft.prop = Prop.Tent;
          draft.part = partOf(tent, { x, y })!;
        } else if (crates.some((c) => c.x === x && c.y === y)) draft.prop = Prop.Crate;
        else if (Math.abs(gap - PALISADE) < 0.5 && distance({ x: x + 0.5, y: y + 0.5 }, gate) > GATE)
          draft.prop = Prop.Stake;
        return true;
      },
    };
  },
};
