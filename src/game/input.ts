import type { Direction } from "./movement";
import type { Action } from "./session";

export interface Press {
  readonly direction: Direction;
  readonly isRepeat: boolean;
}

export interface DirectionInput {
  readonly press: (direction: Direction, at: number) => void;
  readonly release: (direction: Direction) => void;
  readonly take: (at: number) => Press | undefined;
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
      const next =
        tapped !== undefined
          ? { direction: tapped, isRepeat: false }
          : latest && at - latest.since >= repeatDelayMs
            ? { direction: latest.direction, isRepeat: true }
            : undefined;
      tapped = undefined;
      return next;
    },
  };
};

export const actionFor = ({ direction, isRepeat }: Press, facing: Direction, tapTurnsFirst: boolean): Action => ({
  kind: tapTurnsFirst && !isRepeat && direction !== facing ? "face" : "step",
  direction,
});
