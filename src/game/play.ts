import { createTurnClock } from "./clock";
import { type Action, type Session, playTurn } from "./session";
import type { Layers } from "./terrain";

export type Act = (now: number, session: Session) => Action | undefined;

export interface Turn {
  readonly session: Session;
  readonly scheduled: number;
  readonly moved: boolean;
  readonly acted: boolean;
}

export const createPlay = (layers: Layers, start: Session, turnMs: number, now: number) => {
  const clock = createTurnClock(turnMs, now);
  let session = start;
  return {
    session: () => session,
    advance: (now: number, act: Act): Turn | undefined => {
      const scheduled = clock.due(now);
      if (scheduled === undefined) return undefined;
      const previous = session;
      const action = act(now, previous);
      session = playTurn(previous, layers, action);
      return { session, scheduled, moved: session.position !== previous.position, acted: action !== undefined };
    },
  };
};
