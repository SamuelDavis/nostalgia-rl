import { describe, expect, it } from "vitest";
import { fieldOf } from "../../game/terrain.fixtures";
import { type Vec2 } from "procgen";
import { Prop } from "../../worldgen";
import { NOSE_SPAN, OPEN_SPAN, createCamera, leadOf, sightRange, spanFor, surveyFrom } from "./camera";

const ORIGIN: Vec2 = { x: 0, y: 0 };
const EAST = 0;
const NORTH = -Math.PI / 2;

const only = (at: Vec2, prop: Prop = Prop.Oak) => fieldOf((x, y) => (x === at.x && y === at.y ? prop : Prop.None));
const scattered = (every: number) =>
  fieldOf((x, y) => ((x * 7 + y * 3) % every === 0 && (x !== 0 || y !== 0) ? Prop.Oak : Prop.None));
const open = fieldOf(() => Prop.None);

const spanFacing = (terrain: ReturnType<typeof fieldOf>, facing = EAST) =>
  spanFor(sightRange(surveyFrom(terrain, ORIGIN), facing));

describe("spanFor", () => {
  it("is the open view over open ground", () => {
    expect(spanFacing(open)).toBeCloseTo(OPEN_SPAN);
  });

  it("closes all the way with something in your face", () => {
    expect(spanFacing(only({ x: 1, y: 0 }))).toBeLessThan(NOSE_SPAN + 1);
  });

  it("closes less the further away the obstacle", () => {
    const [near, far] = [spanFacing(only({ x: 2, y: 0 })), spanFacing(only({ x: 4, y: 0 }))];
    expect(near).toBeGreaterThan(NOSE_SPAN + 1);
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(OPEN_SPAN);
  });

  it("closes a lot, but not all the way, among many obstacles a little way off", () => {
    const span = spanFacing(scattered(5));
    expect(span).toBeLessThan(OPEN_SPAN / 2);
    expect(span).toBeGreaterThan(NOSE_SPAN + 1);
  });

  it("closes more the denser the obstacles", () => {
    expect(spanFacing(scattered(3))).toBeLessThan(spanFacing(scattered(9)));
  });

  it("closes less for an obstacle to the side than straight ahead", () => {
    expect(spanFacing(only({ x: 1, y: -1 }))).toBeGreaterThan(spanFacing(only({ x: 1, y: 0 })));
  });

  it("ignores what is behind you", () => {
    expect(spanFacing(only({ x: -1, y: 0 }))).toBeCloseTo(OPEN_SPAN);
  });

  it("closes less for a short obstacle than a tall one", () => {
    const boulder = spanFacing(only({ x: 1, y: 0 }, Prop.Boulder));
    expect(boulder).toBeLessThan(OPEN_SPAN);
    expect(boulder).toBeGreaterThan(OPEN_SPAN / 2);
  });

  const cone = fieldOf(
    () => Prop.None,
    (x, y) => 200 - Math.abs(x) - Math.abs(y),
  );
  const fallingEast = fieldOf(
    () => Prop.None,
    (x) => 100 - x,
  );

  it("opens past the open view from a summit with nothing in the way", () => {
    expect(spanFacing(cone)).toBeGreaterThan(OPEN_SPAN * 2);
  });

  it("stays close on a summit among trees", () => {
    const wooded = fieldOf(
      (x, y) => ((x * 7 + y * 3) % 5 === 0 && (x !== 0 || y !== 0) ? Prop.Oak : Prop.None),
      (x, y) => 200 - Math.abs(x) - Math.abs(y),
    );
    expect(spanFacing(wooded)).toBeLessThan(OPEN_SPAN / 2);
  });

  it("opens looking down a slope, and closes looking up it", () => {
    expect(spanFacing(fallingEast, EAST)).toBeGreaterThan(OPEN_SPAN);
    expect(spanFacing(fallingEast, Math.PI)).toBeLessThan(OPEN_SPAN);
  });

  it("changes gradually as you turn", () => {
    const survey = surveyFrom(only({ x: 1, y: 0 }), ORIGIN);
    for (let facing = NORTH; facing < EAST; facing += 0.01)
      expect(Math.abs(spanFor(sightRange(survey, facing + 0.01)) - spanFor(sightRange(survey, facing)))).toBeLessThan(
        1,
      );
  });
});

describe("leadOf", () => {
  const leadFacing = (terrain: ReturnType<typeof fieldOf>, facing = EAST) =>
    leadOf(surveyFrom(terrain, ORIGIN), facing);

  it("leads the way you face over open ground", () => {
    expect(leadFacing(open).x).toBeGreaterThan(OPEN_SPAN / 3);
    expect(leadFacing(open).y).toBeCloseTo(0);
    expect(leadFacing(open, NORTH).y).toBeLessThan(-OPEN_SPAN / 3);
  });

  it("hardly leads with a wall in your face", () => {
    const { x, y } = leadFacing(fieldOf((x) => (x === 1 ? Prop.Oak : Prop.None)));
    expect(Math.hypot(x, y)).toBeLessThan(1);
  });

  it("leads short of the obstacles ahead", () => {
    expect(leadFacing(fieldOf((x) => (x === 6 ? Prop.Oak : Prop.None))).x).toBeLessThan(6);
  });

  it("leads no further than it can see", () => {
    const survey = surveyFrom(only({ x: 1, y: 0 }), ORIGIN);
    const { x, y } = leadOf(survey, EAST);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(sightRange(survey, EAST));
  });

  it("leads toward the clear side", () => {
    const { x, y } = leadFacing(fieldOf((x, y) => (y < 0 && x >= 1 ? Prop.Oak : Prop.None)));
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(1);
  });

  it("leads further past short obstacles than tall ones", () => {
    expect(leadFacing(fieldOf((x) => (x === 2 ? Prop.Boulder : Prop.None))).x).toBeGreaterThan(
      leadFacing(fieldOf((x) => (x === 2 ? Prop.Oak : Prop.None))).x,
    );
  });
});

describe("createCamera", () => {
  const SCREEN = { width: 1000, height: 600 };
  const FRAME_MS = 16;
  const still = { position: { x: 10, y: 20 }, lead: { x: 0, y: 0 }, span: OPEN_SPAN };
  const settled = () => {
    const camera = createCamera();
    camera(still, SCREEN, 0);
    return camera;
  };
  const playerOnScreen = ({ centre, tilePx }: ReturnType<ReturnType<typeof createCamera>>, at: Vec2) => ({
    x: (at.x + 0.5 - centre.x) * tilePx + SCREEN.width / 2,
    y: (at.y + 0.5 - centre.y) * tilePx + SCREEN.height / 2,
  });

  it("centres on the player when there is nothing to lead to", () => {
    expect(playerOnScreen(settled()(still, SCREEN, FRAME_MS), still.position)).toEqual({ x: 500, y: 300 });
  });

  it("flows toward a new lead without jumping", () => {
    const camera = settled();
    const leading = { ...still, lead: { x: 8, y: 0 } };
    const first = camera(leading, SCREEN, FRAME_MS).centre.x - 10.5;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.1);
    for (let frame = 0; frame < 300; frame++) camera(leading, SCREEN, FRAME_MS);
    expect(camera(leading, SCREEN, FRAME_MS).centre.x).toBeCloseTo(18.5);
  });

  it("keeps the player on screen however far it leads", () => {
    const camera = settled();
    const far = { ...still, lead: { x: 1000, y: -1000 } };
    for (let frame = 0; frame < 300; frame++) camera(far, SCREEN, FRAME_MS);
    const { x, y } = playerOnScreen(camera(far, SCREEN, FRAME_MS), still.position);
    expect(x).toBeGreaterThan(SCREEN.width * 0.1);
    expect(y).toBeLessThan(SCREEN.height * 0.9);
  });

  it("closes in faster than it opens out", () => {
    const zoomedAfter = (from: number, to: number) => {
      const camera = createCamera();
      camera({ ...still, span: from }, SCREEN, 0);
      const resting = camera({ ...still, span: to }, SCREEN, 0).restingTilePx;
      const start = SCREEN.height / from;
      return Math.abs(Math.log(camera({ ...still, span: to }, SCREEN, 200).tilePx / start) / Math.log(resting / start));
    };
    expect(zoomedAfter(OPEN_SPAN, NOSE_SPAN)).toBeGreaterThan(zoomedAfter(NOSE_SPAN, OPEN_SPAN));
  });

  it("comes to rest at a whole tile size", () => {
    const camera = settled();
    for (let frame = 0; frame < 300; frame++) camera({ ...still, span: 11 }, SCREEN, FRAME_MS);
    const { tilePx, restingTilePx } = camera({ ...still, span: 11 }, SCREEN, FRAME_MS);
    expect(tilePx).toBe(restingTilePx);
    expect(Number.isInteger(tilePx)).toBe(true);
  });
});
