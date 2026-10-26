import { describe, expect, it } from "vitest";
import { Heading } from "../game/movement";
import { type Session, startSession } from "../game/session";
import { onlySurface } from "../game/terrain";
import { GRASS } from "../game/terrain.fixtures";
import { SURFACE } from "../worldgen";
import {
  STEP_LENGTH,
  approach,
  createMotion,
  facingAngle,
  footstep,
  gait,
  shownOf,
  springToward,
  turnToward,
} from "./motion";

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

describe("gait", () => {
  it("rests on the way at each footfall", () => {
    for (const walked of [0, 1, 2])
      expect(gait(walked, 0.5)).toEqual({ along: expect.closeTo(0), across: expect.any(Number) });
  });

  it("sways to alternate sides on alternate footfalls", () => {
    expect(gait(0, 0.5).across).toBeCloseTo(-gait(STEP_LENGTH, 0.5).across);
    expect(Math.abs(gait(0, 0.5).across)).toBeGreaterThan(0);
  });

  it("sways less than it surges", () => {
    const most = (axis: "along" | "across") =>
      Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(gait((i / 50) * STEP_LENGTH, 0.5)[axis])));
    expect(most("across")).toBeLessThan(most("along"));
  });
});

describe("facingAngle", () => {
  it("rotates clockwise from the glyph's natural eastward facing", () => {
    expect(facingAngle(Heading.East)).toBe(0);
    expect(facingAngle(Heading.South)).toBe(Math.PI / 2);
    expect(facingAngle(Heading.West)).toBe(Math.PI);
  });
});

describe("turnToward", () => {
  it("turns part of the way, the short way round", () => {
    const turned = turnToward(0, facingAngle(Heading.North), 30, 100);
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

describe("springToward", () => {
  const AT_REST = { value: 0, velocity: 0 };
  const run = (frames: number, target = 1, from = AT_REST) =>
    Array.from({ length: frames }).reduce<typeof AT_REST>((s) => springToward(s, target, 16, 200), from);

  it("settles on its target", () => {
    expect(run(200).value).toBeCloseTo(1);
    expect(run(200).velocity).toBeCloseTo(0);
  });

  it("never overshoots from rest", () => {
    for (let frames = 1; frames < 200; frames++) expect(run(frames).value).toBeLessThanOrEqual(1);
  });

  it("starts slowly, unlike an exponential approach", () => {
    expect(run(1).value).toBeLessThan(approach(0, 1, 16, 200) / 2);
  });

  it("carries its velocity through a change of target", () => {
    const moving = run(10);
    const retargeted = springToward(moving, -5, 0, 200);
    expect(retargeted).toEqual(moving);
    expect(springToward(moving, -5, 1, 200).value).toBeGreaterThan(moving.value);
  });
});

describe("createMotion", () => {
  const start = startSession({ x: 0, y: 0 });
  const eastward = (x: number): Session => ({ ...start, facing: Heading.East, offset: { x, y: 0 } });

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
    motion.ticked({
      prior: eastward(0),
      session: eastward(STEP_LENGTH * 1000),
      scheduled: 1000,
      moved: false,
      acted: true,
    });
    expect(motion.poseAt(1000).shown.x).toBeCloseTo(0);
    expect(motion.poseAt(1000 + 5 * TICK_MS).shown.x).toBeCloseTo(STEP_LENGTH);
  });

  it("staggers along a diagonal and sways across it, not round in a circle", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    const southeast = (along: number): Session => ({
      ...start,
      facing: Heading.SouthEast,
      offset: { x: 300 + along, y: along },
    });
    for (let tick = 0; tick < 40; tick++) {
      motion.ticked({
        prior: southeast(tick * 50),
        session: southeast((tick + 1) * 50),
        scheduled: tick * TICK_MS,
        moved: false,
        acted: true,
      });
      const { shown } = motion.poseAt(tick * TICK_MS + TICK_MS / 2);
      const straight = shownOf(southeast(tick * 50 + 25));
      const [dx, dy] = [shown.x - straight.x, shown.y - straight.y];
      const across = Math.abs(dx - dy) / Math.SQRT2;
      expect(across).toBeLessThan(0.04);
    }
  });

  it("rises with a climb's progress", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    const climbing: Session = { ...eastward(500), climb: { to: { x: 1, y: 0 }, layer: SURFACE, spent: 9, ticks: 10 } };
    motion.ticked({ prior: climbing, session: climbing, scheduled: 0, moved: false, acted: true });
    expect(motion.poseAt(10_000).eyeLevel).toBeCloseTo(GRASS.height + 0.9);
  });

  it("eases the eye level and facing toward the new tile and direction", () => {
    const motion = createMotion(TICK_MS, start, risingEast, 0);
    const arrived: Session = { ...start, position: { x: 1, y: 0 }, facing: Heading.East };
    motion.ticked({ prior: arrived, session: arrived, scheduled: 0, moved: true, acted: true });
    const { eyeLevel, angle } = motion.poseAt(30);
    expect(eyeLevel).toBeGreaterThan(GRASS.height);
    expect(eyeLevel).toBeLessThan(GRASS.height + 1);
    expect(angle).toBeLessThan(facingAngle(Heading.South));
    expect(angle).toBeGreaterThan(facingAngle(Heading.East));
  });
});
