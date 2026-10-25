import { type PlacedProp as Placed, type Vec2, footprints } from "procgen";
import { metresToLevels } from "./constants";
import { Prop } from "./terrain";

export type PlacedProp = Placed<Prop>;

export type Crossing = "walk" | "push" | "climb" | "never";

export interface PropTraits {
  readonly solid: boolean;
  readonly crossing: Crossing;
  readonly height: number;
  readonly footprint?: Vec2;
}

const solid = (crossing: Exclude<Crossing, "walk">, metres: number, footprint?: Vec2): PropTraits => ({
  solid: true,
  crossing,
  height: metresToLevels(metres),
  footprint,
});

const open = (metres = 0): PropTraits => ({ solid: false, crossing: "walk", height: metresToLevels(metres) });

export const PROPS: Record<Prop, PropTraits> = {
  [Prop.None]: open(),
  [Prop.Oak]: solid("push", 6),
  [Prop.Pine]: solid("push", 6),
  [Prop.Cactus]: solid("push", 2),
  [Prop.Bush]: open(1),
  [Prop.Boulder]: solid("climb", 1),
  [Prop.Flowers]: open(),
  [Prop.Tuft]: open(),
  [Prop.Tent]: solid("never", 2, { x: 2, y: 2 }),
  [Prop.Campfire]: solid("climb", 0.5),
  [Prop.Bridge]: open(),
  [Prop.Rock]: solid("never", Infinity),
  [Prop.Stalagmite]: solid("climb", 2),
  [Prop.CaveMouth]: solid("never", Infinity),
  [Prop.RampDown]: open(),
  [Prop.RampUp]: open(),
  [Prop.Ramp]: open(),
  [Prop.CaveExit]: open(),
  [Prop.MineEntrance]: solid("never", Infinity),
  [Prop.Shed]: solid("never", 3, { x: 3, y: 4 }),
  [Prop.Stockpile]: solid("never", 2, { x: 4, y: 4 }),
  [Prop.Bunkhouse]: solid("never", 4, { x: 10, y: 5 }),
  [Prop.Wall]: solid("never", 6),
  [Prop.Door]: open(),
  [Prop.Hearth]: solid("climb", 1),
  [Prop.Bed]: solid("climb", 0.5),
  [Prop.Table]: solid("climb", 1),
  [Prop.Bench]: open(0.5),
  [Prop.Counter]: solid("climb", 1),
  [Prop.Altar]: solid("climb", 1),
  [Prop.Anvil]: solid("climb", 1),
  [Prop.Forge]: solid("climb", 1.5),
  [Prop.Barrel]: solid("climb", 1),
  [Prop.Hay]: solid("climb", 1.5),
  [Prop.Well]: solid("never", 1),
  [Prop.Railing]: solid("climb", 1),
  [Prop.Stump]: solid("climb", 0.5),
  [Prop.LogPile]: solid("climb", 1.5),
  [Prop.Crate]: solid("climb", 1),
  [Prop.Stake]: solid("climb", 2),
  [Prop.Bones]: open(),
  [Prop.StandingStone]: solid("climb", 3),
  [Prop.Crop]: open(1),
  [Prop.FruitTree]: solid("push", 4),
  [Prop.Fence]: solid("climb", 1),
  [Prop.Hollow]: open(),
};

export const {
  sizeOf: footprintOf,
  partOf,
  tilesOf,
} = footprints<Prop>(
  Object.fromEntries(Object.entries(PROPS).flatMap(([prop, { footprint }]) => (footprint ? [[prop, footprint]] : []))),
);
