import { type Reader, type Vec2, boundsOf, grid, nearest, scatter, stage } from "procgen";
import { biomeOf } from "./biome";
import type { Fields } from "./fields";
import { Biome } from "./terrain";

export const Identity = {
  Farmland: "farmland",
  Woodland: "woodland",
  Highland: "highland",
  Wilds: "wilds",
  Uncanny: "uncanny",
} as const;
export type Identity = (typeof Identity)[keyof typeof Identity];

export interface Province extends Vec2 {
  readonly id: number;
  readonly identity: Identity;
}

export const PROVINCE_SIZE = 1024;
export const PROVINCE_REACH = 2 * PROVINCE_SIZE;
export const UNCANNY_THRESHOLD = 0.45;
const SEAT_MARGIN = 128;

export const provinceCells = grid(PROVINCE_SIZE);

const BIOME_IDENTITIES: Record<Biome, Identity> = {
  [Biome.Ocean]: Identity.Wilds,
  [Biome.Beach]: Identity.Wilds,
  [Biome.Grassland]: Identity.Farmland,
  [Biome.Forest]: Identity.Woodland,
  [Biome.Desert]: Identity.Wilds,
  [Biome.Mountain]: Identity.Highland,
};

export const identityOf = (biome: Biome, uncanny: number): Identity =>
  uncanny > UNCANNY_THRESHOLD && biome !== Biome.Ocean ? Identity.Uncanny : BIOME_IDENTITIES[biome];

export const createProvinces = (fields: Fields) => {
  const seats = stage({
    name: "province seats",
    grid: provinceCells,
    compute: (cell, { rng }): readonly Province[] =>
      scatter({ grid: provinceCells, rng, margin: SEAT_MARGIN })(cell).map((p) => ({
        ...p,
        id: rng.u32(cell.col, cell.row, 2),
        identity: identityOf(biomeOf(fields.conditions(p.x, p.y)), fields.uncanny(p.x, p.y)),
      })),
  });
  return {
    seats,
    provinceAt: (reader: Reader, p: Vec2): Province => nearest(reader, seats, p, PROVINCE_REACH)!,
    seatsAround: (reader: Reader, p: Vec2): readonly Province[] => reader.gather(seats, boundsOf([p], PROVINCE_REACH)),
  };
};

export type Provinces = ReturnType<typeof createProvinces>;
