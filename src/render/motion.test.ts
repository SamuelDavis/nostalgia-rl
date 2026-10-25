import { describe, expect, it } from "vitest";
import { Direction } from "../game/movement";
import { type Session, startSession } from "../game/session";
import { onlySurface } from "../game/terrain";
import { GRASS } from "../game/terrain.fixtures";
import { SURFACE } from "../worldgen";
import { approach, createMotion, facingAngle, footstep, shownOf, turnToward } from "./motion";

const TICK_MS = 10;

describe("shownOf", () => {
  it("shows a subject at its tile, shifted by its offset", () => {
    expect(shownOf(startSession({ x: 3, y: 4 }))).toEqual({ x: 3, y: 4 });
    expect(shownOf({ ...startSession({ x: 3, y: 4 }), offset: { x: 250, y: -500 } })).toEqual({ x: 3.25, y: 3.5 });
  });
});

describe("footstep", () => {
  it("leaves tile centres and edges where they are", () => {
    for (const at of [0, 0.5, 1, -2]) expect(footstep(at, 0.5)).toBeCloseTo(at);
  });

  it("slows near each tile centre, like footsteps", () => {
    const covered = (from: number, to: number) => footstep(to, 0.5) - footstep(from, 0.5);
    expect(covered(0, 0.1)).toBeLessThan(covered(0.45, 0.55) / 2);
    expect(covered(0.9, 1)).toBeLessThan(covered(0.45, 0.55) / 2);
    expect(covered(0, 0.1)).toBeGreaterThan(0);
  });
});

describe("facingAngle", () => {
  it("rotates clockwise from the glyph's natural eastward facing", () => {
    expect(facingAngle(Direction.East)).toBe(0);
    expect(facingAngle(Direction.South)).toBe(Math.PI / 2);
    expect(facingAngle(Direction.West)).toBe(Math.PI);
  });
});

describe("turnToward", () => {
  it("turns part of the way, the short way round", () => {
    const turned = turnToward(0, facingAngle(Direction.North), 30, 100);
    expect(turned).toBeLessThan(0);
    expect(turned).toBeGreaterThan(-Math.PI / 2);
  });

  it("arrives given time", () => {
    expect(turnToward(0, Math.PI / 2, 10000, 100)).toBeCloseTo(Math.PI / 2);
  });
});

describe("approach", () => {
  it("moves part of the way toward the target, more with more time", () => {
    const short = approach(0, 10, 50, 250);
    const long = approach(0, 10, 500, 250);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(10);
  });
});

const risingEast = onlySurface((x) => ({ ...GRASS, height: GRASS.height + x }));

describe("createMotion", () => {
  const start = startSession({ x: 0, y: 0 });
  const eastward = (x: number): Session => ({ ...start, facing: Direction.East, offset: { x, y: 0 } });

  it("poses a still player where it stands, at its eye level, facing its way", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    expect(motion.poseAt(0)).toEqual({
      shown: { x: 0, y: 0 },
      angle: facingAngle(start.facing),
      eyeLevel: GRASS.height,
    });
  });

  it("moves from the tick before toward the latest over one tick from its scheduled moment", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    motion.ticked({ prior: eastward(0), session: eastward(500), scheduled: 1000, moved: false, acted: true });
    expect(motion.poseAt(1000).shown.x).toBeCloseTo(0);
    expect(motion.poseAt(1000 + 5 * TICK_MS).shown.x).toBeCloseTo(0.5);
  });

  it("rises with a climb's progress", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    const climbing: Session = { ...eastward(500), climb: { to: { x: 1, y: 0 }, layer: SURFACE, spent: 9, ticks: 10 } };
    motion.ticked({ prior: climbing, session: climbing, scheduled: 0, moved: false, acted: true });
    expect(motion.poseAt(10_000).eyeLevel).toBeCloseTo(GRASS.height + 0.9);
  });

  it("eases the eye level and facing toward the new tile and direction", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    const arrived: Session = { ...start, position: { x: 1, y: 0 }, facing: Direction.East };
    motion.ticked({ prior: arrived, session: arrived, scheduled: 0, moved: true, acted: true });
    const { eyeLevel, angle } = motion.poseAt(30);
    expect(eyeLevel).toBeGreaterThan(GRASS.height);
    expect(eyeLevel).toBeLessThan(GRASS.height + 1);
    expect(angle).toBeLessThan(facingAngle(Direction.South));
    expect(angle).toBeGreaterThan(facingAngle(Direction.East));
  });
});
