import { type Heading, headingOf, vectorOf } from "../game/movement";
import type { Action } from "../game/session";

export interface Press {
  readonly heading: Heading;
  readonly isRepeat: boolean;
}

export interface DirectionInput {
  readonly press: (heading: Heading, at: number) => void;
  readonly release: (heading: Heading) => void;
  readonly take: (at: number) => Press | undefined;
}

interface Hold {
  readonly heading: Heading;
  readonly since: number;
}

const combined = (held: readonly Hold[]): Heading | undefined => {
  const latestOn = (axis: "x" | "y") => {
    const latest = held.findLast((h) => vectorOf(h.heading)[axis] !== 0);
    return latest ? vectorOf(latest.heading)[axis] : 0;
  };
  return headingOf({ x: latestOn("x"), y: latestOn("y") });
};

export const createDirectionInput = (repeatDelayMs: number): DirectionInput => {
  let held: Hold[] = [];
  let tapped: Heading | undefined;
  return {
    press: (heading, at) => {
      held = [...held.filter((h) => h.heading !== heading), { heading, since: at }];
      tapped = combined(held);
    },
    release: (heading) => {
      held = held.filter((h) => h.heading !== heading);
    },
    take: (at) => {
      const heading = combined(held);
      const latest = held.at(-1);
      const next =
        tapped !== undefined
          ? { heading: tapped, isRepeat: false }
          : heading !== undefined && latest && at - latest.since >= repeatDelayMs
            ? { heading, isRepeat: true }
            : undefined;
      tapped = undefined;
      return next;
    },
  };
};

export const actionFor = ({ heading, isRepeat }: Press, facing: Heading, tapTurnsFirst: boolean): Action => ({
  kind: isRepeat ? "push" : tapTurnsFirst && heading !== facing ? "face" : "step",
  heading,
});
