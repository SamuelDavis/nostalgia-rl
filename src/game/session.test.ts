import { describe, expect, it } from "vitest";
import { type CaveFloor, Prop, type Layer, SURFACE } from "../worldgen";
import { Direction, STEP_TICKS } from "./movement";
import { type Action, type Session, playTick, startSession } from "./session";
import { type Layers, type Terrain, onlySurface } from "./terrain";
import { GRASS } from "./terrain.fixtures";

const flat: Terrain = () => GRASS;
const propEast =
  (prop: Prop): Terrain =>
  (x, y) =>
    x > 0 ? { ...flat(x, y), prop } : flat(x, y);
const cave: CaveFloor = { cave: { x: 7, y: 7 }, floor: 0 };
const mouthEast: Layers = {
  terrainOn: (layer: Layer) => (layer === SURFACE ? propEast(Prop.Wall) : flat),
  linkAcross: (_, from, to) => (from.x === 0 && to.x === 1 ? cave : undefined),
};

const step = (direction: Direction): Action => ({ kind: "step", direction });
const push = (direction: Direction): Action => ({ kind: "push", direction });
const ORIGIN = startSession({ x: 0, y: 0 });

const play = (layers: Layers, actions: readonly (Action | undefined)[], from: Session = ORIGIN) =>
  actions.reduce((session, action) => playTick(session, layers, action), from);
const idle = (ticks: number) => Array<undefined>(ticks).fill(undefined);
const holding = (action: Action, ticks: number) => Array<Action>(ticks).fill(action);

describe("playTick", () => {
  it("advances the tick without moving when idle", () => {
    expect(play(onlySurface(flat), [undefined])).toMatchObject({ tick: 1, position: { x: 0, y: 0 } });
  });

  it("faces a step's direction at once and arrives a step's ticks later", () => {
    const started = play(onlySurface(flat), [step(Direction.West)]);
    expect(started).toMatchObject({ position: { x: 0, y: 0 }, facing: Direction.West });
    expect(play(onlySurface(flat), idle(STEP_TICKS - 2), started).position).toEqual({ x: 0, y: 0 });
    expect(play(onlySurface(flat), idle(STEP_TICKS - 1), started)).toMatchObject({
      position: { x: -1, y: 0 },
      stride: undefined,
    });
  });

  it("goes one step on level ground for one press, however long the wait after", () => {
    expect(play(onlySurface(flat), [step(Direction.East), ...idle(5 * STEP_TICKS)]).position).toEqual({ x: 1, y: 0 });
  });

  it("keeps going while the direction is held", () => {
    const walked = play(onlySurface(flat), [
      step(Direction.East),
      ...holding(push(Direction.East), 3 * STEP_TICKS - 1),
    ]);
    expect(walked.position).toEqual({ x: 3, y: 0 });
  });

  it("makes part of a slow stride per press, keeping the progress through a pause", () => {
    const trees = onlySurface(propEast(Prop.Oak));
    const once = play(trees, [step(Direction.East), ...idle(5 * STEP_TICKS)]);
    expect(once.position).toEqual({ x: 0, y: 0 });
    expect(once.stride).toMatchObject({ to: { x: 1, y: 0 }, spent: STEP_TICKS, ticks: 3 * STEP_TICKS });
    const thrice = play(
      trees,
      [step(Direction.East), ...idle(STEP_TICKS), step(Direction.East), ...idle(STEP_TICKS)],
      once,
    );
    expect(thrice).toMatchObject({ position: { x: 1, y: 0 }, stride: undefined });
  });

  it("abandons a stride's progress on turning away", () => {
    const trees = onlySurface(propEast(Prop.Oak));
    const started = play(trees, [step(Direction.East), ...idle(STEP_TICKS)]);
    const turned = play(trees, [step(Direction.North)], started);
    expect(turned).toMatchObject({ facing: Direction.North, stride: { to: { x: 0, y: -1 }, spent: 1 } });
  });

  it("faces an impassable obstacle without moving, and clears it on the next move", () => {
    const walled = onlySurface(propEast(Prop.Wall));
    const bumped = play(walled, [step(Direction.East), ...idle(STEP_TICKS)]);
    expect(bumped).toMatchObject({ position: { x: 0, y: 0 }, facing: Direction.East, blocked: Prop.Wall });
    expect(play(walled, [step(Direction.North)], bumped).blocked).toBeUndefined();
  });

  it("turns to face without moving", () => {
    const turned = play(onlySurface(flat), [{ kind: "face", direction: Direction.East }, ...idle(STEP_TICKS)]);
    expect(turned).toMatchObject({ position: { x: 0, y: 0 }, facing: Direction.East, stride: undefined });
  });

  it("starts on the surface", () => {
    expect(ORIGIN.layer).toBe(SURFACE);
  });

  it("crosses a link onto the layer beyond it, and stays on it off a link", () => {
    const inside = play(mouthEast, [step(Direction.East), ...idle(STEP_TICKS)]);
    expect(inside).toMatchObject({ position: { x: 1, y: 0 }, layer: cave, blocked: undefined });
    expect(play(mouthEast, [step(Direction.East), ...idle(STEP_TICKS)], inside)).toMatchObject({
      position: { x: 2, y: 0 },
      layer: cave,
    });
  });
});
