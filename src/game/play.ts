import { createTickClock } from "./clock";
import { type Action, type Session, playTick } from "./session";
import type { Layers } from "./terrain";

export type Act = (now: number, session: Session) => Action | undefined;

export interface Ticks {
  readonly prior: Session;
  readonly session: Session;
  readonly scheduled: number;
  readonly moved: boolean;
  readonly acted: boolean;
}

export const createPlay = (layers: Layers, start: Session, tickMs: number, now: number) => {
  const clock = createTickClock(tickMs, now);
  let session = start;
  return {
    session: () => session,
    advance: (now: number, act: Act): Ticks | undefined => {
      const due = clock.due(now);
      if (due.length === 0) return undefined;
      const previous = session;
      let acted = false;
      let prior = session;
      for (const scheduled of due) {
        prior = session;
        const action = act(scheduled, session);
        acted ||= action !== undefined;
        session = playTick(session, layers, action);
      }
      const moved = session.position !== previous.position;
      return { prior, session, scheduled: due.at(-1)!, moved, acted };
    },
  };
};
