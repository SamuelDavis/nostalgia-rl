import type { Direction } from "./movement";

export interface DirectionInput {
  readonly press: (direction: Direction) => void;
  readonly release: (direction: Direction) => void;
  readonly take: () => Direction | undefined;
}

export const createDirectionInput = (): DirectionInput => {
  let held: Direction[] = [];
  let tapped: Direction | undefined;
  return {
    press: (direction) => {
      held = [...held.filter((d) => d !== direction), direction];
      tapped = direction;
    },
    release: (direction) => {
      held = held.filter((d) => d !== direction);
    },
    take: () => {
      const next = tapped ?? held.at(-1);
      tapped = undefined;
      return next;
    },
  };
};
