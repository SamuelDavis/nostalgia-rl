import type { Direction } from "./movement";

export interface DirectionInput {
  readonly press: (direction: Direction, at: number) => void;
  readonly release: (direction: Direction) => void;
  readonly take: (at: number) => Direction | undefined;
}

interface Hold {
  readonly direction: Direction;
  readonly since: number;
}

export const createDirectionInput = (repeatDelayMs: number): DirectionInput => {
  let held: Hold[] = [];
  let tapped: Direction | undefined;
  return {
    press: (direction, at) => {
      held = [...held.filter((h) => h.direction !== direction), { direction, since: at }];
      tapped = direction;
    },
    release: (direction) => {
      held = held.filter((h) => h.direction !== direction);
    },
    take: (at) => {
      const latest = held.at(-1);
      const repeating = latest && at - latest.since >= repeatDelayMs ? latest.direction : undefined;
      const next = tapped ?? repeating;
      tapped = undefined;
      return next;
    },
  };
};
