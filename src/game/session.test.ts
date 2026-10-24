import { describe, expect, it } from "vitest";
import { type CaveFloor, Prop, type Layer, SURFACE } from "../worldgen";
import { Direction } from "./movement";
import { playTurn, startSession } from "./session";
import { type Terrain, onlySurface } from "./terrain";
import { GRASS } from "./terrain.fixtures";

const flat: Terrain = () => GRASS;
const walledEast: Terrain = (x, y) => (x > 0 ? { ...flat(x, y), prop: Prop.Boulder } : flat(x, y));
const cave: CaveFloor = { cave: { x: 7, y: 7 }, floor: 0 };
const mouthEast = {
  terrainOn: (layer: Layer) => (layer === SURFACE ? walledEast : flat),
  linkAcross: (_: unknown, from: { x: number }, to: { x: number }) => (from.x === 0 && to.x === 1 ? cave : undefined),
};

describe("playTurn", () => {
  it("advances the turn without moving when idle", () => {
    const next = playTurn(startSession({ x: 0, y: 0 }), onlySurface(flat), undefined);
    expect(next).toMatchObject({ turn: 1, position: { x: 0, y: 0 } });
  });

  it("moves and faces the chosen direction", () => {
    const next = playTurn(startSession({ x: 0, y: 0 }), onlySurface(flat), { kind: "step", direction: Direction.West });
    expect(next).toMatchObject({ position: { x: -1, y: 0 }, facing: Direction.West, blocked: undefined });
  });

  it("turns to face a blocker without moving, and clears it on the next move", () => {
    const bumped = playTurn(startSession({ x: 0, y: 0 }), onlySurface(walledEast), {
      kind: "step",
      direction: Direction.East,
    });
    expect(bumped).toMatchObject({
      position: { x: 0, y: 0 },
      facing: Direction.East,
      blocked: { blocker: "obstacle", prop: Prop.Boulder },
    });
    expect(
      playTurn(bumped, onlySurface(walledEast), { kind: "step", direction: Direction.North }).blocked,
    ).toBeUndefined();
  });

  it("turns to face without moving", () => {
    const turned = playTurn(startSession({ x: 0, y: 0 }), onlySurface(walledEast), {
      kind: "face",
      direction: Direction.East,
    });
    expect(turned).toMatchObject({ position: { x: 0, y: 0 }, facing: Direction.East, blocked: undefined });
  });

  it("starts on the surface", () => {
    expect(startSession({ x: 0, y: 0 }).layer).toBe(SURFACE);
  });

  it("crosses a link onto the layer beyond it", () => {
    const inside = playTurn(startSession({ x: 0, y: 0 }), mouthEast, { kind: "step", direction: Direction.East });
    expect(inside).toMatchObject({ position: { x: 1, y: 0 }, layer: cave, blocked: undefined });
  });

  it("stays on its layer off a link", () => {
    const inside = playTurn(startSession({ x: 0, y: 0 }), mouthEast, { kind: "step", direction: Direction.East });
    expect(playTurn(inside, mouthEast, { kind: "step", direction: Direction.East })).toMatchObject({
      position: { x: 2, y: 0 },
      layer: cave,
    });
  });
});
