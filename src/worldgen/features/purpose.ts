import type { Vec2 } from "procgen";

export const Role = {
  Hideout: "hideout",
  Worksite: "worksite",
  Lair: "lair",
  Shelter: "shelter",
  Shrine: "shrine",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const Occupant = {
  Bandits: "bandits",
  Woodcutter: "woodcutter",
  Farmer: "farmer",
  Beasts: "beasts",
} as const;
export type Occupant = (typeof Occupant)[keyof typeof Occupant];

export const Good = {
  Timber: "timber",
  Grain: "grain",
  Fruit: "fruit",
  Livestock: "livestock",
} as const;
export type Good = (typeof Good)[keyof typeof Good];

export interface Relation {
  readonly kind: "supplies" | "preys on";
  readonly target: Vec2;
}

export interface Purpose {
  readonly role: Role;
  readonly occupants: readonly Occupant[];
  readonly produces: readonly Good[];
  readonly relation?: Relation;
}
