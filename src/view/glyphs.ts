import { Feature, Ground, Water } from "../worldgen";

export const PLAYER_GLYPH = "@";
export const STAIRS_GLYPH = "≡";

export const featureGlyph: Record<Feature, string> = {
  [Feature.None]: "",
  [Feature.Oak]: "♣",
  [Feature.Pine]: "♠",
  [Feature.Cactus]: "¥",
  [Feature.Bush]: "♦",
  [Feature.Boulder]: "●",
  [Feature.Flowers]: "*",
  [Feature.Tuft]: '"',
  [Feature.Tent]: "▲",
  [Feature.Campfire]: "☼",
  [Feature.Bridge]: "#",
};

export const groundGlyph: Record<Ground, string> = {
  [Ground.Grass]: ".",
  [Ground.Dirt]: ".",
  [Ground.Sand]: "·",
  [Ground.Rock]: ":",
  [Ground.Snow]: "·",
  [Ground.Road]: "=",
  [Ground.Path]: "∙",
};

export const waterGlyph: Record<Exclude<Water, typeof Water.None>, string> = {
  [Water.Shallow]: "~",
  [Water.Deep]: "≈",
};
