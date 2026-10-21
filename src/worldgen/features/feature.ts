import type { Vec2 } from "procgen";
import { MAX_CLIMB } from "../constants";
import type { Biome, Cover, Ground, Prop, Water, Way } from "../terrain";

export interface Anchor extends Vec2 {
  readonly id: number;
}

export interface Opening {
  readonly outside: Vec2;
  readonly inside: Vec2;
}

export interface TileDraft {
  height: number;
  ground: Ground;
  water: Water;
  prop: Prop;
  part: number;
  way: Way;
  cover: Cover;
  readonly biome: Biome;
  readonly forestness: number;
}

export const settle = (level: number, target: number, gap: number): number => {
  const slack = Math.ceil(Math.max(0, gap)) * MAX_CLIMB;
  return Math.min(target + slack, Math.max(target - slack, level));
};
