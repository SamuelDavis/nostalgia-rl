import "./index.css";
import type { Point } from "./lib";
import { createDirectionInput } from "./game/input";
import { Direction, stepToward } from "./game/movement";
import { playTurn, startSession } from "./game/session";
import { createTerrain } from "./game/terrain";
import { createCamera, lookOffset, modifierWithin, naturalSpan, openness, spanOf, steer } from "./view/camera";
import { createHud } from "./view/hud";
import { createMap } from "./view/map";
import { HEIGHT_MODES, type HeightMode } from "./view/palette";
import { createViewport } from "./view/viewport";
import { createWorldgen } from "./worldgen";

const DEFAULT_TURN_MS = 100;
const URL_SYNC_DELAY_MS = 300;
const ZOOM_STEP = 4;

const KEY_DIRECTIONS: Record<string, Direction> = {
  KeyW: Direction.North,
  KeyD: Direction.East,
  KeyS: Direction.South,
  KeyA: Direction.West,
};

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1);
const turnMs = Number(params.get("turn") ?? DEFAULT_TURN_MS);

const world = createWorldgen(seed);
const terrain = createTerrain(world);
const input = createDirectionInput();

const canvas = document.createElement("canvas");
document.querySelector<HTMLDivElement>("#placeholder")!.replaceWith(canvas);
const ctx = canvas.getContext("2d")!;
const hud = createHud(document.body, world);
const map = createMap(document.body, world);

let session = startSession({
  x: Number(params.get("x") ?? world.spawn.x),
  y: Number(params.get("y") ?? world.spawn.y),
});
let mode: HeightMode = HEIGHT_MODES[0];
let zoomModifier = 0;
const opennessAt = (p: Point) => openness((x, y) => terrain(x, y).height, p);
let open = opennessAt(session.position);
let heading: Point = { x: 0, y: 0 };
let natural = naturalSpan(open, heading);
const camera = createCamera();
const drawViewport = createViewport(ctx);

let urlSync: ReturnType<typeof setTimeout> | undefined;
const syncUrl = () => {
  clearTimeout(urlSync);
  urlSync = setTimeout(() => {
    params.set("seed", String(seed));
    params.set("x", String(session.position.x));
    params.set("y", String(session.position.y));
    history.replaceState(null, "", `?${params}`);
  }, URL_SYNC_DELAY_MS);
};

let dirty = true;
let drawn = "";
let lastFrame = performance.now();
const render = (now: number) => {
  const view = camera(
    { position: session.position, look: lookOffset(open, heading), span: spanOf(natural, zoomModifier) },
    { width: canvas.clientWidth, height: canvas.clientHeight },
    now - lastFrame,
  );
  lastFrame = now;
  const placement = [view.centre.x * view.tilePx, view.centre.y * view.tilePx, view.tilePx * 100]
    .map(Math.round)
    .join();
  if (!dirty && placement === drawn) return;
  drawViewport(terrain, view, session.position, mode);
  hud.update({
    session,
    turnMs,
    tile: terrain(session.position.x, session.position.y),
    mode,
    zoom: { natural, modifier: zoomModifier },
  });
  drawn = placement;
  dirty = false;
};

const zoomBy = (delta: number) => {
  zoomModifier = modifierWithin(natural, zoomModifier + delta);
  dirty = true;
};

const resize = () => {
  const ratio = devicePixelRatio;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  dirty = true;
};

let nextTurn = performance.now() + turnMs;
const frame = (now: number) => {
  if (now >= nextTurn) {
    const previous = session.position;
    session = playTurn(session, terrain, input.take());
    if (session.position !== previous) {
      open = opennessAt(session.position);
      syncUrl();
    }
    heading = steer(heading, stepToward({ x: 0, y: 0 }, session.facing));
    natural = naturalSpan(open, heading);
    dirty = true;
    nextTurn = Math.max(nextTurn + turnMs, now);
  }
  render(now);
  requestAnimationFrame(frame);
};

addEventListener("keydown", (event) => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction !== undefined && !event.repeat) input.press(direction);
  if (event.code === "KeyM") map.toggle(session.position, mode);
  if (event.code === "KeyH") {
    mode = HEIGHT_MODES[(HEIGHT_MODES.indexOf(mode) + 1) % HEIGHT_MODES.length]!;
    dirty = true;
  }
  if (event.code === "Equal" || event.code === "NumpadAdd") zoomBy(-ZOOM_STEP);
  if (event.code === "Minus" || event.code === "NumpadSubtract") zoomBy(ZOOM_STEP);
});
addEventListener("keyup", (event) => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction !== undefined) input.release(direction);
});
addEventListener("blur", () => Object.values(Direction).forEach(input.release));
addEventListener("resize", resize);
addEventListener("wheel", (event) => zoomBy(Math.sign(event.deltaY) * ZOOM_STEP));

resize();
requestAnimationFrame(frame);
