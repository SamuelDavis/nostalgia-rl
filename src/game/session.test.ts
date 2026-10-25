import { describe, expect, it } from "vitest";
import { type CaveFloor, Prop, type Layer, SURFACE, metresToLevels } from "../worldgen";
import { BODY_RADIUS, Direction, STEP_TICKS, TILE_UNITS } from "./movement";
import { type Action, type Session, playTick, startSession } from "./session";
import { type Layers, type Terrain, onlySurface } from "./terrain";
import { GRASS } from "./terrain.fixtures";

const HALF = TILE_UNITS / 2;
const flat: Terrain = () => GRASS;
const eastOf =
  (prop: Prop): Terrain =>
  (x) =>
    x > 0 ? { ...GRASS, prop } : GRASS;
const ledgeEast =
  (metres: number): Terrain =>
  (x) => ({
    ...GRASS,
    height: GRASS.height + (x > 0 ? metresToLevels(metres) : 0),
  });
const doorNorth: Terrain = (x, y) => (y === -1 && x !== 0 ? { ...GRASS, prop: Prop.Wall } : GRASS);
const cave: CaveFloor = { cave: { x: 7, y: 7 }, floor: 0 };
const mouthEast: Layers = {
  terrainOn: (layer: Layer) => (layer === SURFACE ? eastOf(Prop.Wall) : flat),
  linkAcross: (_, from, to) => (from.x === 0 && to.x === 1 ? cave : undefined),
};

const step = (direction: Direction): Action => ({ kind: "step", direction });
const push = (direction: Direction): Action => ({ kind: "push", direction });
const ORIGIN = startSession({ x: 0, y: 0 });

const play = (layers: Layers, actions: readonly (Action | undefined)[], from: Session = ORIGIN) =>
  actions.reduce((session, action) => playTick(session, layers, action), from);
const idle = (ticks: number) => Array<undefined>(ticks).fill(undefined);
const holding = (action: Action, ticks: number) => Array<Action>(ticks).fill(action);
const tap = (direction: Direction) => [step(direction), ...idle(4 * STEP_TICKS)];

describe("playTick", () => {
  it("advances the tick without moving when idle", () => {
    expect(play(onlySurface(flat), [undefined])).toMatchObject({ tick: 1, position: { x: 0, y: 0 } });
  });

  it("goes one tile on level ground for a tap, in a step's ticks, and stops at its centre", () => {
    const layers = onlySurface(flat);
    expect(play(layers, [step(Direction.West), ...idle(STEP_TICKS - 2)]).offset).not.toEqual({ x: 0, y: 0 });
    expect(play(layers, [step(Direction.West), ...idle(STEP_TICKS - 1)])).toMatchObject({
      position: { x: -1, y: 0 },
      offset: { x: 0, y: 0 },
      facing: Direction.West,
    });
    expect(play(layers, tap(Direction.West)).position).toEqual({ x: -1, y: 0 });
  });

  it("keeps going while the direction is held, and stops wherever it is let go", () => {
    const layers = onlySurface(flat);
    expect(play(layers, [step(Direction.East), ...holding(push(Direction.East), 3 * STEP_TICKS - 1)]).position).toEqual(
      {
        x: 3,
        y: 0,
      },
    );
    const letGo = play(layers, [...holding(push(Direction.East), 3), ...idle(STEP_TICKS)]);
    expect(letGo).toMatchObject({ position: { x: 0, y: 0 }, offset: { x: 300, y: 0 } });
  });

  it("enters a tile when its centre crosses the edge, and slows among trees from then on", () => {
    const trees = onlySurface(eastOf(Prop.Oak));
    const once = play(trees, tap(Direction.East));
    expect(once.position).toEqual({ x: 1, y: 0 });
    expect(once.offset.x).toBeLessThan(-HALF / 2);
    expect(play(trees, [...tap(Direction.East), ...tap(Direction.East)])).toMatchObject({
      position: { x: 1, y: 0 },
      offset: { x: 0, y: 0 },
    });
  });

  it("keeps its offset on turning, moving on from where it stands", () => {
    const partway = play(onlySurface(eastOf(Prop.Oak)), [...holding(push(Direction.East), 3), ...idle(1)]);
    const turned = play(onlySurface(eastOf(Prop.Oak)), tap(Direction.North), partway);
    expect(turned).toMatchObject({ position: { x: 0, y: -1 }, offset: { x: 300, y: 0 }, facing: Direction.North });
  });

  it("stops its body at the edge of an impassable tile, and says what blocked it", () => {
    const walled = play(onlySurface(eastOf(Prop.Wall)), holding(push(Direction.East), 3 * STEP_TICKS));
    expect(walled).toMatchObject({
      position: { x: 0, y: 0 },
      offset: { x: HALF - BODY_RADIUS, y: 0 },
      blocked: Prop.Wall,
    });
    expect(play(onlySurface(eastOf(Prop.Wall)), [step(Direction.North)], walled).blocked).toBeUndefined();
  });

  it("slides round a door frame it catches, into the doorway", () => {
    const layers = onlySurface(doorNorth);
    const offCentre = play(layers, [...holding(push(Direction.East), 3), ...idle(1)]);
    const through = play(layers, holding(push(Direction.North), 3 * STEP_TICKS), offCentre);
    expect(through.position.x).toBe(0);
    expect(through.position.y).toBeLessThan(-1);
    expect(through.offset.x).toBeLessThanOrEqual(HALF - BODY_RADIUS);
  });

  it("climbs a cliff at its edge, keeping the progress through a pause, and abandons it on turning away", () => {
    const cliff = onlySurface(ledgeEast(2));
    const atFace = play(cliff, [step(Direction.East), ...holding(push(Direction.East), 50)]);
    expect(atFace).toMatchObject({ position: { x: 0, y: 0 }, offset: { x: HALF, y: 0 } });
    expect(atFace.climb?.spent).toBeGreaterThan(0);
    const paused = play(cliff, idle(STEP_TICKS), atFace);
    expect(paused.climb).toEqual(atFace.climb);
    expect(play(cliff, [step(Direction.North)], atFace).climb).toBeUndefined();
    const { spent, ticks } = atFace.climb!;
    const top = play(cliff, holding(push(Direction.East), ticks - spent), atFace);
    expect(top.position).toEqual({ x: 1, y: 0 });
  });

  it("climbs down faster than up", () => {
    const cliff = onlySurface(ledgeEast(10));
    const ticksToCross = (from: Session, direction: Direction) => {
      let session = from;
      for (let ticks = 1; ; ticks++) {
        session = playTick(session, cliff, push(direction));
        if (session.position.x !== from.position.x) return ticks;
      }
    };
    const up = ticksToCross(ORIGIN, Direction.East);
    const down = ticksToCross(startSession({ x: 1, y: 0 }), Direction.West);
    expect(down).toBeLessThan(up);
  });

  it("turns to face without moving", () => {
    const turned = play(onlySurface(flat), [{ kind: "face", direction: Direction.East }, ...idle(STEP_TICKS)]);
    expect(turned).toMatchObject({ position: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, facing: Direction.East });
  });

  it("starts on the surface", () => {
    expect(ORIGIN.layer).toBe(SURFACE);
  });

  it("crosses a link onto the layer beyond it, and stays on it off a link", () => {
    const inside = play(mouthEast, tap(Direction.East));
    expect(inside).toMatchObject({ position: { x: 1, y: 0 }, layer: cave, blocked: undefined });
    expect(play(mouthEast, tap(Direction.East), inside)).toMatchObject({ position: { x: 2, y: 0 }, layer: cave });
  });
});
