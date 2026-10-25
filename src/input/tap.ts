import type { Vec2 } from "procgen";
import { Direction } from "../game/movement";

export const directionAt = ({ x, y }: Vec2, { width, height }: { width: number; height: number }): Direction => {
  const across = (2 * x) / width - 1;
  const down = (2 * y) / height - 1;
  if (Math.abs(across) > Math.abs(down)) return across > 0 ? Direction.East : Direction.West;
  return down > 0 ? Direction.South : Direction.North;
};
