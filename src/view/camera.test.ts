import { describe, expect, it } from "vitest";
import { Direction } from "../game/movement";
import type { Terrain } from "../game/terrain";
import { type Point } from "../lib";
import { Biome, Cover, Ground, Prop, Water, Way } from "../worldgen";
import {
  SETTLE_MS,
  approach,
  attentiveSpan,
  SIGHT_REACH,
  createCamera,
  lookOffset,
  naturalSpan,
  openness,
  practicalSpan,
  sightAhead,
  steer,
} from "./camera";

const cone = (x: number, y: number) => 200 - Math.abs(x) - Math.abs(y);
const plain = () => 100;
const risingEast = (x: number) => 100 + x;

const EAST: Point = { x: 1, y: 0 };
const WEST: Point = { x: -1, y: 0 };
const SOUTH: Point = { x: 0, y: 1 };
const STILL: Point = { x: 0, y: 0 };
const ORIGIN: Point = { x: 0, y: 0 };

const walk = (steps: readonly Point[], from: Point = STILL) => steps.reduce(steer, from);

describe("openness", () => {
  it("is closed in every direction on level ground", () => {
    expect(openness(plain, ORIGIN).every((o) => o === 0)).toBe(true);
  });

  it("is open in every direction from a summit", () => {
    expect(openness(cone, ORIGIN).every((o) => o > 0.5)).toBe(true);
  });

  it("is open down a slope and enclosed up it", () => {
    const open = openness(risingEast, ORIGIN);
    expect(Math.max(...open)).toBeGreaterThan(0.5);
    expect(Math.min(...open)).toBeLessThan(-0.5);
  });
});

describe("steer", () => {
  it("takes a few steps to establish a heading", () => {
    expect(walk([EAST]).x).toBeLessThan(0.5);
    expect(walk([EAST, EAST, EAST, EAST, EAST]).x).toBeGreaterThan(0.75);
  });

  it("keeps an established heading through a single turn", () => {
    const heading = walk([SOUTH], walk(Array(6).fill(EAST)));
    expect(heading.x).toBeGreaterThan(heading.y);
  });

  it("settles on a diagonal when alternating directions", () => {
    const heading = walk(Array.from({ length: 12 }, (_, i) => (i % 2 ? EAST : SOUTH)));
    expect(Math.abs(heading.x - heading.y)).toBeLessThan(0.35);
  });
});

describe("naturalSpan", () => {
  it("stays close on level ground whichever way you look", () => {
    expect(naturalSpan(openness(plain, ORIGIN), EAST)).toBe(naturalSpan(openness(plain, ORIGIN), STILL));
  });

  it("opens looking down a slope and closes looking up it", () => {
    const slope = openness(risingEast, ORIGIN);
    const level = naturalSpan(openness(plain, ORIGIN), EAST);
    expect(naturalSpan(slope, WEST)).toBeGreaterThan(level);
    expect(naturalSpan(slope, EAST)).toBeLessThan(level);
  });

  it("opens from a summit whichever way you look", () => {
    const summit = openness(cone, ORIGIN);
    expect(naturalSpan(summit, EAST)).toBeGreaterThan(naturalSpan(openness(plain, ORIGIN), EAST));
    expect(naturalSpan(summit, EAST)).toBe(naturalSpan(summit, WEST));
  });
});

describe("practicalSpan", () => {
  it("stays well inside the settled view", () => {
    for (const ground of [plain, cone, risingEast])
      for (const heading of [EAST, WEST, STILL])
        expect(practicalSpan(openness(ground, ORIGIN), heading)).toBeLessThan(
          naturalSpan(openness(ground, ORIGIN), heading),
        );
  });

  it("widens a little looking down and narrows a little looking up", () => {
    const slope = openness(risingEast, ORIGIN);
    const level = practicalSpan(openness(plain, ORIGIN), EAST);
    expect(practicalSpan(slope, WEST)).toBeGreaterThan(level);
    expect(practicalSpan(slope, EAST)).toBeLessThan(level);
  });
});

const field =
  (prop: (x: number, y: number) => Prop, height: (x: number, y: number) => number = () => 100): Terrain =>
  (x, y) => ({
    height: height(x, y),
    ground: Ground.Grass,
    water: Water.None,
    prop: prop(x, y),
    part: 0,
    biome: Biome.Grassland,
    way: Way.None,
    cover: Cover.None,
  });

describe("sightAhead", () => {
  const open = field(() => Prop.None);
  const wallAt = (at: number) => field((x) => (x === at ? Prop.Oak : Prop.None));
  const scattered = (every: number) => field((x, y) => ((x * 7 + y * 3) % every === 0 ? Prop.Oak : Prop.None));

  it("sees to its reach over open ground", () => {
    expect(sightAhead(open, ORIGIN, Direction.East).distance).toBeCloseTo(SIGHT_REACH);
  });

  it("is nothing with a wall in your face, and grows as you step back", () => {
    expect(sightAhead(wallAt(1), ORIGIN, Direction.East).distance).toBe(0);
    expect(sightAhead(wallAt(2), ORIGIN, Direction.East).distance).toBeGreaterThan(0);
    expect(sightAhead(wallAt(3), ORIGIN, Direction.East).distance).toBeGreaterThan(
      sightAhead(wallAt(2), ORIGIN, Direction.East).distance,
    );
  });

  it("is shortened only partly by a single obstacle a few tiles ahead", () => {
    const tree = field((x, y) => (x === 3 && y === 0 ? Prop.Oak : Prop.None));
    const sight = sightAhead(tree, ORIGIN, Direction.East).distance;
    expect(sight).toBeGreaterThan(0);
    expect(sight).toBeLessThan(SIGHT_REACH);
  });

  it("sees over obstacles whose tops are below eye level, not at it", () => {
    const below = (drop: number, prop: Prop) =>
      field(
        (x) => (x >= 2 ? prop : Prop.None),
        (x) => (x >= 2 ? 100 - drop : 100),
      );
    expect(sightAhead(below(16, Prop.Pine), ORIGIN, Direction.East).distance).toBeCloseTo(SIGHT_REACH);
    expect(sightAhead(below(2, Prop.Boulder), ORIGIN, Direction.East).distance).toBeCloseTo(SIGHT_REACH);
    expect(sightAhead(below(2, Prop.Pine), ORIGIN, Direction.East).distance).toBeLessThan(2);
    expect(sightAhead(below(9, Prop.Pine), ORIGIN, Direction.East).distance).toBeLessThan(2);
  });

  it("sees across a dip back to ground no higher than its eye", () => {
    const dip = field(
      () => Prop.None,
      (x) => (x === 1 ? 84 : 101),
    );
    expect(sightAhead(dip, ORIGIN, Direction.East).distance).toBeCloseTo(SIGHT_REACH);
  });

  it("does not slip between obstacles that meet at a corner", () => {
    const diagonalWall = field((x, y) => (x + y === 3 ? Prop.Oak : Prop.None));
    expect(sightAhead(diagonalWall, ORIGIN, Direction.East).distance).toBeLessThan(3);
  });

  it("weighs near obstacles more than far open sight lines", () => {
    const nearOnOneSide = field((x, y) => (y < 0 && x >= 1 ? Prop.Oak : Prop.None));
    expect(sightAhead(nearOnOneSide, ORIGIN, Direction.East).distance).toBeLessThan(SIGHT_REACH / 2);
  });

  it("is shorter the denser the obstacles around you", () => {
    const sparse = sightAhead(scattered(13), { x: 1, y: 1 }, Direction.East).distance;
    const dense = sightAhead(scattered(3), { x: 1, y: 1 }, Direction.East).distance;
    expect(dense).toBeLessThan(sparse);
    expect(sparse).toBeLessThan(SIGHT_REACH);
  });

  const stepAt2 = (height: number) =>
    field(
      () => Prop.None,
      (x) => (x >= 2 ? height : 100),
    );

  it("is stopped by a cliff rising ahead", () => {
    expect(sightAhead(stepAt2(120), ORIGIN, Direction.East).distance).toBeLessThan(2);
  });

  it("sees over a cliff dropping away ahead", () => {
    expect(sightAhead(stepAt2(80), ORIGIN, Direction.East).distance).toBeCloseTo(SIGHT_REACH);
  });

  it("narrows less for an obstacle to the side than for one straight ahead", () => {
    const ahead = field((x, y) => (x === 2 && y === 0 ? Prop.Oak : Prop.None));
    const aside = field((x, y) => (x === 2 && y === -2 ? Prop.Oak : Prop.None));
    expect(sightAhead(aside, ORIGIN, Direction.East).distance).toBeGreaterThan(
      sightAhead(ahead, ORIGIN, Direction.East).distance,
    );
  });

  it("leads straight ahead when sight is clear", () => {
    const { lead } = sightAhead(open, ORIGIN, Direction.East);
    expect(lead.x).toBeCloseTo(1);
    expect(lead.y).toBeCloseTo(0);
  });

  it("leads toward the clear side", () => {
    const blockedLeft = field((x, y) => (y < 0 && x >= 1 ? Prop.Oak : Prop.None));
    const { lead } = sightAhead(blockedLeft, ORIGIN, Direction.East);
    expect(lead.x).toBeGreaterThan(0);
    expect(lead.y).toBeGreaterThan(0.1);
  });

  it("hardly leads with a wall ahead", () => {
    const { lead } = sightAhead(wallAt(2), ORIGIN, Direction.East);
    expect(Math.hypot(lead.x, lead.y)).toBeLessThan(0.15);
  });

  it("only looks the way you face", () => {
    expect(sightAhead(wallAt(1), ORIGIN, Direction.West).distance).toBeCloseTo(SIGHT_REACH);
  });
});

describe("attentiveSpan", () => {
  const spans = { natural: 50, practical: 15, sight: SIGHT_REACH };

  it("holds the practical view while acting and settles to the natural view when idle", () => {
    expect(attentiveSpan(spans, 0)).toBe(15);
    expect(attentiveSpan(spans, SETTLE_MS - 1)).toBe(15);
    expect(attentiveSpan(spans, SETTLE_MS)).toBe(50);
  });

  it("closes in as sight shortens, even when idle", () => {
    const nose = attentiveSpan({ ...spans, sight: 0 }, SETTLE_MS);
    const nearby = attentiveSpan({ ...spans, sight: 1 }, 0);
    expect(nose).toBeLessThan(nearby);
    expect(nearby).toBeLessThan(15);
  });
});

describe("lookOffset", () => {
  it("leads where sight leads", () => {
    const offset = lookOffset(openness(plain, ORIGIN), EAST);
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.y).toBe(0);
  });

  it("leans toward open ground, away from rising ground", () => {
    expect(lookOffset(openness(risingEast, ORIGIN), STILL).x).toBeLessThan(0);
    expect(lookOffset(openness(cone, ORIGIN), STILL).x).toBeCloseTo(0);
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

describe("createCamera", () => {
  it("keeps the subject at the same place on screen while only the zoom changes", () => {
    const camera = createCamera();
    const screen = { width: 1000, height: 600 };
    const subject = { position: { x: 10, y: 20 }, look: { x: 0.25, y: 0 } };
    const onScreen = (span: number, elapsedMs: number) => {
      const { centre, tilePx } = camera({ ...subject, span }, screen, elapsedMs);
      return (subject.position.x + 0.5 - centre.x) * tilePx;
    };
    onScreen(14, 0);
    const settled = onScreen(14, 5000);
    for (let frame = 0; frame < 30; frame++) expect(onScreen(40, 16)).toBeCloseTo(settled);
  });
});
