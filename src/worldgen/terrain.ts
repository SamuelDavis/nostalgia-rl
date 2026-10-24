export const Biome = {
  Ocean: 0,
  Beach: 1,
  Grassland: 2,
  Forest: 3,
  Desert: 4,
  Mountain: 5,
} as const;
export type Biome = (typeof Biome)[keyof typeof Biome];

export const Ground = {
  Grass: 0,
  Dirt: 1,
  Sand: 2,
  Rock: 3,
  Snow: 4,
  Dressed: 5,
  Planks: 6,
  Tilled: 7,
} as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export const Way = { None: 0, Road: 1, Path: 2 } as const;
export type Way = (typeof Way)[keyof typeof Way];

export const Cover = { None: 0, Canopy: 1, Thatch: 2, Slate: 3, Rock: 4 } as const;
export type Cover = (typeof Cover)[keyof typeof Cover];

export const Water = { None: 0, Shallow: 1, Deep: 2 } as const;
export type Water = (typeof Water)[keyof typeof Water];

export const Prop = {
  None: 0,
  Oak: 1,
  Pine: 2,
  Cactus: 3,
  Bush: 4,
  Boulder: 5,
  Flowers: 6,
  Tuft: 7,
  Tent: 8,
  Campfire: 9,
  Bridge: 10,
  Rock: 11,
  Stalagmite: 12,
  CaveMouth: 13,
  RampDown: 14,
  RampUp: 15,
  Ramp: 16,
  CaveExit: 17,
  MineEntrance: 18,
  Shed: 19,
  Stockpile: 20,
  Bunkhouse: 21,
  Wall: 22,
  Door: 23,
  Hearth: 24,
  Bed: 25,
  Table: 26,
  Bench: 27,
  Counter: 28,
  Altar: 29,
  Anvil: 30,
  Forge: 31,
  Barrel: 32,
  Hay: 33,
  Well: 34,
  Railing: 35,
  Stump: 36,
  LogPile: 37,
  Crate: 38,
  Stake: 39,
  Bones: 40,
  StandingStone: 41,
  Crop: 42,
  FruitTree: 43,
  Fence: 44,
  Hollow: 45,
} as const;
export type Prop = (typeof Prop)[keyof typeof Prop];
