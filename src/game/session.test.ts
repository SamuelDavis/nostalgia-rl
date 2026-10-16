import { describe, expect, it } from "vitest";
import { Feature, Ground, Water } from "../worldgen";
import { Direction } from "./movement";
import { playTurn, startSession } from "./session";
import type { Terrain } from "./terrain";

const flat: Terrain = () => ({ height: 100, ground: Ground.Grass, water: Water.None, feature: Feature.None, biome: 2 });
const walledEast: Terrain = (x, y) => (x > 0 ? { ...flat(x, y), feature: Feature.Boulder } : flat(x, y));

describe("playTurn", () => {
  it("advances the turn without moving when idle", () => {
    const next = playTurn(startSession({ x: 0, y: 0 }), flat, undefined);
    expect(next).toMatchObject({ turn: 1, position: { x: 0, y: 0 } });
  });

  it("moves and faces the chosen direction", () => {
    const next = playTurn(startSession({ x: 0, y: 0 }), flat, Direction.West);
    expect(next).toMatchObject({ position: { x: -1, y: 0 }, facing: Direction.West, blocked: undefined });
  });

  it("turns to face a blocker without moving, and clears it on the next move", () => {
    const bumped = playTurn(startSession({ x: 0, y: 0 }), walledEast, Direction.East);
    expect(bumped).toMatchObject({ position: { x: 0, y: 0 }, facing: Direction.East, blocked: "obstacle" });
    expect(playTurn(bumped, walledEast, Direction.North).blocked).toBeUndefined();
  });
});
