import { Biome, Cover, Ground, Prop, Water, Way } from "../worldgen";
import type { Terrain, Tile } from "./terrain";

export const GRASS: Tile = {
  height: 100,
  ground: Ground.Grass,
  water: Water.None,
  prop: Prop.None,
  part: 0,
  biome: Biome.Grassland,
  way: Way.None,
  cover: Cover.None,
};

export const fieldOf =
  (prop: (x: number, y: number) => Prop, height: (x: number, y: number) => number = () => GRASS.height): Terrain =>
  (x, y) => ({ ...GRASS, height: height(x, y), prop: prop(x, y) });
