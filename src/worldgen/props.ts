import { type PlacedProp as Placed, footprints } from "procgen";
import { Prop } from "./terrain";

export type PlacedProp = Placed<Prop>;

export const {
  sizeOf: footprintOf,
  partOf,
  tilesOf,
} = footprints<Prop>({
  [Prop.Tent]: { x: 2, y: 2 },
  [Prop.Shed]: { x: 3, y: 4 },
  [Prop.Stockpile]: { x: 4, y: 4 },
  [Prop.Bunkhouse]: { x: 10, y: 5 },
});
