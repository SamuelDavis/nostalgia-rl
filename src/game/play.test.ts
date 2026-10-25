import { describe, expect, it } from "vitest";
import { Direction } from "./movement";
import { createPlay } from "./play";
import { type Action, startSession } from "./session";
import { onlySurface } from "./terrain";
import { GRASS } from "./terrain.fixtures";

const TURN_MS = 100;
const flat = onlySurface(() => GRASS);
const idle = () => undefined;
const stepEast = (): Action => ({ kind: "step", direction: Direction.East });

describe("createPlay", () => {
  it("plays no turn before one is due", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TURN_MS, 0);
    expect(play.advance(TURN_MS - 1, stepEast)).toBeUndefined();
    expect(play.session().turn).toBe(0);
  });

  it("plays the action taken when the turn is due, scheduled on the clock", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TURN_MS, 0);
    const turn = play.advance(TURN_MS + 7, stepEast);
    expect(turn).toMatchObject({ scheduled: TURN_MS, moved: true, acted: true });
    expect(turn?.session).toBe(play.session());
    expect(play.session()).toMatchObject({ turn: 1, position: { x: 1, y: 0 } });
  });

  it("asks for the action with the session it will act on", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TURN_MS, 0);
    const asked: number[] = [];
    play.advance(TURN_MS, (_, session) => {
      asked.push(session.turn);
      return undefined;
    });
    expect(asked).toEqual([0]);
  });

  it("reports an idle turn as neither moved nor acted", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TURN_MS, 0);
    expect(play.advance(TURN_MS, idle)).toMatchObject({ moved: false, acted: false });
  });

  it("reports turning in place as acted but not moved", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TURN_MS, 0);
    const face = (): Action => ({ kind: "face", direction: Direction.North });
    expect(play.advance(TURN_MS, face)).toMatchObject({ moved: false, acted: true });
  });
});
