import { type Vec2, mod } from "procgen";
import type { Heading } from "../game/movement";

const EAST = 2;

export const headingAt = ({ x, y }: Vec2, { width, height }: { width: number; height: number }): Heading => {
  const across = (2 * x) / width - 1;
  const down = (2 * y) / height - 1;
  return mod(Math.round(Math.atan2(down, across) / (Math.PI / 4)) + EAST, 8) as Heading;
};
