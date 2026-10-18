import { Cover, Prop, Ground, Water, Way, footprintOf } from "../worldgen";

export const PLAYER_GLYPH = "@";
export const STAIRS_GLYPH = "≡";
export const THRESHOLD_GLYPH = "∩";

const framed = (prop: Prop, fill: string): string => {
  const { x: width, y: depth } = footprintOf(prop);
  return Array.from({ length: depth }, (_, y) => {
    const [left, edge, right] = y === 0 ? ["┌", "─", "┐"] : y === depth - 1 ? ["└", "─", "┘"] : ["│", fill, "│"];
    return left + edge.repeat(width - 2) + right;
  }).join("");
};

const filled = (prop: Prop, glyph: string): string => {
  const { x: width, y: depth } = footprintOf(prop);
  return glyph.repeat(width * depth);
};

export const propGlyph: Record<Prop, string> = {
  [Prop.None]: "",
  [Prop.Oak]: "♣",
  [Prop.Pine]: "♠",
  [Prop.Cactus]: "¥",
  [Prop.Bush]: "♦",
  [Prop.Boulder]: "●",
  [Prop.Flowers]: "*",
  [Prop.Tuft]: '"',
  [Prop.Tent]: "◢◣▌▐",
  [Prop.Campfire]: "☼",
  [Prop.Bridge]: "#",
  [Prop.Rock]: "",
  [Prop.Stalagmite]: "^",
  [Prop.CaveMouth]: THRESHOLD_GLYPH,
  [Prop.CaveExit]: THRESHOLD_GLYPH,
  [Prop.RampDown]: ">",
  [Prop.RampUp]: "<",
  [Prop.Ramp]: STAIRS_GLYPH,
  [Prop.MineEntrance]: "Π",
  [Prop.Shed]: framed(Prop.Shed, "▒"),
  [Prop.Stockpile]: filled(Prop.Stockpile, "▪"),
  [Prop.Bunkhouse]: framed(Prop.Bunkhouse, "▒"),
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
  [Ground.Dressed]: "·",
};

export const wayGlyph: Record<Exclude<Way, typeof Way.None>, string> = {
  [Way.Road]: "=",
  [Way.Path]: "∙",
};

export const waterGlyph: Record<Exclude<Water, typeof Water.None>, string> = {
  [Water.Shallow]: "~",
  [Water.Deep]: "≈",
};
