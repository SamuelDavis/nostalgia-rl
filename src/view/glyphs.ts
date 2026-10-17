import { Cover, Prop, Ground, Water, Way } from "../worldgen";

export const PLAYER_GLYPH = "@";
export const STAIRS_GLYPH = "≡";
export const THRESHOLD_GLYPH = "∩";

export const propGlyph: Record<Prop, string> = {
  [Prop.None]: "",
  [Prop.Oak]: "♣",
  [Prop.Pine]: "♠",
  [Prop.Cactus]: "¥",
  [Prop.Bush]: "♦",
  [Prop.Boulder]: "●",
  [Prop.Flowers]: "*",
  [Prop.Tuft]: '"',
  [Prop.Tent]: "▲",
  [Prop.Campfire]: "☼",
  [Prop.Bridge]: "#",
};

export const coverGlyph: Record<Exclude<Cover, typeof Cover.None>, string> = {
  [Cover.Canopy]: "♣",
};

export const groundGlyph: Record<Ground, string> = {
  [Ground.Grass]: ".",
  [Ground.Dirt]: ".",
  [Ground.Sand]: "·",
  [Ground.Rock]: ":",
  [Ground.Snow]: "·",
};

export const wayGlyph: Record<Exclude<Way, typeof Way.None>, string> = {
  [Way.Road]: "=",
  [Way.Path]: "∙",
};

export const waterGlyph: Record<Exclude<Water, typeof Water.None>, string> = {
  [Water.Shallow]: "~",
  [Water.Deep]: "≈",
};
