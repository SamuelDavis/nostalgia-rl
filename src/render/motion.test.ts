import { describe, expect, it } from "vitest";
import { Direction } from "../game/movement";
import { type Session, startSession } from "../game/session";
import { onlySurface } from "../game/terrain";
import { GRASS } from "../game/terrain.fixtures";
import { SURFACE } from "../worldgen";
import { approach, createMotion, facingAngle, shownOf, turnToward } from "./motion";

const TICKS = 10;
const TICK_MS = 10;

describe("shownOf", () => {
  const striding = (spent: number, to = { x: 1, y: 0 }): Session => ({
    ...startSession({ x: 0, y: 0 }),
    stride: { to, layer: SURFACE, spent, ticks: TICKS },
  });

  it("shows a still subject where it stands", () => {
    expect(shownOf(startSession({ x: 3, y: 4 }))).toEqual({ x: 3, y: 4 });
  });

  it("shows a stride as far along as its progress", () => {
    expect(shownOf(striding(0))).toEqual({ x: 0, y: 0 });
    expect(shownOf(striding(TICKS / 2)).x).toBeCloseTo(0.5);
  });

  it("slows at the start and end of each stride, like footsteps", () => {
    const covered = (from: number, to: number) => shownOf(striding(to)).x - shownOf(striding(from)).x;
    expect(covered(0, 1)).toBeLessThan(covered(4.5, 5.5) / 2);
    expect(covered(9, 10)).toBeLessThan(covered(4.5, 5.5) / 2);
    expect(covered(0, 1)).toBeGreaterThan(0);
  });

  it("varies a little from stride to stride", () => {
    const starts = [1, 2, 3, 4].map((x) => shownOf(striding(1, { x, y: 0 })).x.toFixed(6));
    expect(new Set(starts).size).toBeGreaterThan(1);
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
  const halfway: Session = {
    ...start,
    tick: 1,
    facing: Direction.East,
    stride: { to: { x: 1, y: 0 }, layer: SURFACE, spent: TICKS / 2, ticks: TICKS },
  };
  const arrived: Session = { ...halfway, tick: 2, position: { x: 1, y: 0 }, stride: undefined };

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
    motion.ticked({ prior: halfway, session: arrived, scheduled: 1000, moved: true, acted: true });
    expect(motion.poseAt(1000).shown.x).toBeCloseTo(0.5);
    expect(motion.poseAt(1000 + TICK_MS / 2).shown.x).toBeCloseTo(0.75);
    expect(motion.poseAt(1000 + 5 * TICK_MS).shown).toEqual({ x: 1, y: 0 });
  });

  it("eases the eye level and facing toward the stride's tile and direction", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    motion.ticked({ prior: halfway, session: halfway, scheduled: 0, moved: false, acted: true });
    const { eyeLevel, angle } = motion.poseAt(30);
    expect(eyeLevel).toBeGreaterThan(GRASS.height);
    expect(eyeLevel).toBeLessThan(GRASS.height + 0.5);
    expect(angle).toBeLessThan(facingAngle(Direction.South));
    expect(angle).toBeGreaterThan(facingAngle(Direction.East));
  });
});
