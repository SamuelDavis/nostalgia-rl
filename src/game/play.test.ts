import { describe, expect, it } from "vitest";
import { Heading, STEP_TICKS } from "./movement";
import { createPlay } from "./play";
import { type Action, startSession } from "./session";
import { onlySurface } from "./terrain";
import { GRASS } from "./terrain.fixtures";

const TICK_MS = 10;
const flat = onlySurface(() => GRASS);
const idle = () => undefined;
const pushEast = (): Action => ({ kind: "push", heading: Heading.East });

describe("createPlay", () => {
  it("plays no tick before one is due", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TICK_MS, 0);
    expect(play.advance(TICK_MS - 1, pushEast)).toBeUndefined();
    expect(play.session().tick).toBe(0);
  });

  it("plays every tick due, reporting the last one scheduled on the clock", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TICK_MS, 0);
    const ticks = play.advance(STEP_TICKS * TICK_MS + 7, pushEast);
    expect(ticks).toMatchObject({ scheduled: STEP_TICKS * TICK_MS, moved: true, acted: true });
    expect(ticks?.session).toBe(play.session());
    expect(play.session()).toMatchObject({ tick: STEP_TICKS, position: { x: 1, y: 0 } });
  });

  it("reports the session one tick before the last", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TICK_MS, 0);
    expect(play.advance(3 * TICK_MS, idle)?.prior.tick).toBe(2);
  });

  it("asks for each tick's action at its scheduled moment, with the session it will act on", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TICK_MS, 0);
    const asked: [number, number][] = [];
    play.advance(2 * TICK_MS, (at, session) => {
      asked.push([at, session.tick]);
      return undefined;
    });
    expect(asked).toEqual([
      [TICK_MS, 0],
      [2 * TICK_MS, 1],
    ]);
  });

  it("reports idle ticks as neither moved nor acted", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TICK_MS, 0);
    expect(play.advance(TICK_MS, idle)).toMatchObject({ moved: false, acted: false });
  });

  it("reports progress short of a tile as acted but not moved", () => {
    const play = createPlay(flat, startSession({ x: 0, y: 0 }), TICK_MS, 0);
    expect(play.advance(TICK_MS, pushEast)).toMatchObject({ moved: false, acted: true });
  });
});
