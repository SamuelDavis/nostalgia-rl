import { type PlacedProp as Placed, type Vec2, footprints } from "procgen";
import { metresToLevels } from "./constants";
import { Prop } from "./terrain";

export type PlacedProp = Placed<Prop>;

export interface PropTraits {
  readonly solid: boolean;
  readonly height: number;
  readonly footprint?: Vec2;
}

const solid = (metres: number, footprint?: Vec2): PropTraits => ({
  solid: true,
  height: metresToLevels(metres),
  footprint,
});

const open = (metres = 0): PropTraits => ({ solid: false, height: metresToLevels(metres) });

export const PROPS: Record<Prop, PropTraits> = {
  [Prop.None]: open(),
  [Prop.Oak]: solid(6),
  [Prop.Pine]: solid(6),
  [Prop.Cactus]: solid(2),
  [Prop.Bush]: open(1),
  [Prop.Boulder]: solid(1),
  [Prop.Flowers]: open(),
  [Prop.Tuft]: open(),
  [Prop.Tent]: solid(2, { x: 2, y: 2 }),
  [Prop.Campfire]: solid(0.5),
  [Prop.Bridge]: open(),
  [Prop.Rock]: solid(Infinity),
  [Prop.Stalagmite]: solid(2),
  [Prop.CaveMouth]: solid(Infinity),
  [Prop.RampDown]: open(),
  [Prop.RampUp]: open(),
  [Prop.Ramp]: open(),
  [Prop.CaveExit]: open(),
  [Prop.MineEntrance]: solid(Infinity),
  [Prop.Shed]: solid(3, { x: 3, y: 4 }),
  [Prop.Stockpile]: solid(2, { x: 4, y: 4 }),
  [Prop.Bunkhouse]: solid(4, { x: 10, y: 5 }),
  [Prop.Wall]: solid(6),
  [Prop.Door]: open(),
  [Prop.Hearth]: solid(1),
  [Prop.Bed]: solid(0.5),
  [Prop.Table]: solid(1),
  [Prop.Bench]: open(0.5),
  [Prop.Counter]: solid(1),
  [Prop.Altar]: solid(1),
  [Prop.Anvil]: solid(1),
  [Prop.Forge]: solid(1.5),
  [Prop.Barrel]: solid(1),
  [Prop.Hay]: solid(1.5),
  [Prop.Well]: solid(1),
  [Prop.Railing]: solid(1),
};

export const {
  sizeOf: footprintOf,
  partOf,
  tilesOf,
} = footprints<Prop>(
  Object.fromEntries(
    Object.entries(PROPS).flatMap(([prop, { footprint }]) => (footprint ? [[prop, footprint]] : [])),
  ),
);
