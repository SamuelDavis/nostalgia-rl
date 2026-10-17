import "./index.css";
import type { Point } from "./lib";
import { actionFor, createDirectionInput } from "./game/input";
import { Direction, stepToward } from "./game/movement";
import { playTurn, startSession } from "./game/session";
import { createChunkStore } from "./game/chunk-store";
import { createTerrain } from "./game/terrain";
import type { ChunkRequest } from "./chunk-worker";
import {
  approach,
  attentiveSpan,
  sightAhead,
  createCamera,
  lookOffset,
  modifierWithin,
  naturalSpan,
  openness,
  practicalSpan,
  spanOf,
  steer,
} from "./view/camera";
import { type Control, createHud } from "./view/hud";
import { createGlide, facingAngle, turnToward } from "./view/motion";
import { directionAt } from "./view/tap";
import { createMap } from "./view/map";
import { HEIGHT_MODES, type HeightMode } from "./view/palette";
import { createViewport } from "./view/viewport";
import { type Chunk, CHUNK_SIZE, createWorldgen, generateChunk } from "./worldgen";

const DEFAULT_TURN_MS = 100;
const DEFAULT_REPEAT_DELAY_MS = 50;
const URL_SYNC_DELAY_MS = 300;
const ZOOM_STEP = 4;
const EYE_EASING_MS = 300;
const TURN_EASING_MS = 60;
const PREFETCH_SPANS = 2;

const KEY_DIRECTIONS: Record<string, Direction> = {
  KeyW: Direction.North,
  KeyD: Direction.East,
  KeyS: Direction.South,
  KeyA: Direction.West,
};

const params = new URLSearchParams(location.search);
const seed = Number(params.get("seed") ?? 1);
const turnMs = Number(params.get("turn") ?? DEFAULT_TURN_MS);
const repeatDelayMs = Number(params.get("repeat") ?? DEFAULT_REPEAT_DELAY_MS);

const world = createWorldgen(seed);
const worker = new Worker(new URL("./chunk-worker.ts", import.meta.url), { type: "module" });
const chunks = createChunkStore(
  (cx, cy) => generateChunk(world, cx, cy),
  (cx, cy) => worker.postMessage({ seed, cx, cy } satisfies ChunkRequest),
);
worker.addEventListener("message", ({ data }: MessageEvent<Chunk>) => chunks.receive(data));
const terrain = createTerrain(chunks.chunkAt);
const input = createDirectionInput(repeatDelayMs);

const canvas = document.createElement("canvas");
document.querySelector<HTMLDivElement>("#placeholder")!.replaceWith(canvas);
const ctx = canvas.getContext("2d")!;

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
let practical = practicalSpan(open, heading);
let sight = sightAhead(terrain, session.position, session.facing);
let lastActionAt = performance.now();
let tapTurnsFirst = false;
let angle = facingAngle(session.facing);
let eyeLevel = terrain(session.position.x, session.position.y).height;
const camera = createCamera();
const glide = createGlide(turnMs, session.position);
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
  const shown = glide.shownAt(now);
  angle = turnToward(angle, facingAngle(session.facing), now - lastFrame, TURN_EASING_MS);
  eyeLevel = approach(eyeLevel, terrain(session.position.x, session.position.y).height, now - lastFrame, EYE_EASING_MS);
  const span = attentiveSpan({ natural, practical, sight }, now - lastActionAt);
  const view = camera(
    { position: shown, look: lookOffset(open, heading), span: spanOf(span, zoomModifier) },
    { width: canvas.clientWidth, height: canvas.clientHeight },
    now - lastFrame,
  );
  lastFrame = now;
  const placement = [view.centre.x, view.centre.y, shown.x, shown.y]
    .map((v) => v * view.tilePx)
    .concat(view.tilePx * 100, eyeLevel * 100, angle * 100)
    .map(Math.round)
    .join();
  if (!dirty && placement === drawn) return;
  drawViewport(terrain, view, { position: session.position, shown, eyeLevel, angle }, mode);
  hud.update({
    session,
    turnMs,
    tile: terrain(session.position.x, session.position.y),
    mode,
    zoom: { span, natural, modifier: zoomModifier },
    tapTurnsFirst,
  });
  drawn = placement;
  dirty = false;
};

const zoomBy = (delta: number) => {
  zoomModifier = modifierWithin(natural, zoomModifier + delta);
  dirty = true;
};

const controls: readonly Control[] = [
  { keys: ["KeyI"], label: "I info", run: () => hud.toggle() },
  {
    keys: ["KeyT"],
    label: "T tap mode",
    run: () => {
      tapTurnsFirst = !tapTurnsFirst;
      dirty = true;
    },
  },
  { keys: ["KeyM"], label: "M map", run: () => map.toggle(session.position, mode) },
  {
    keys: ["KeyH"],
    label: "H height mode",
    run: () => {
      mode = HEIGHT_MODES[(HEIGHT_MODES.indexOf(mode) + 1) % HEIGHT_MODES.length]!;
      dirty = true;
    },
  },
  { keys: ["Equal", "NumpadAdd"], label: "+ zoom in", run: () => zoomBy(-ZOOM_STEP) },
  { keys: ["Minus", "NumpadSubtract"], label: "− zoom out", run: () => zoomBy(ZOOM_STEP) },
];
const hud = createHud(document.body, world, controls);
const map = createMap(document.body, world);

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
    const scheduled = nextTurn;
    const previous = session.position;
    const press = input.take(now);
    const action = press && actionFor(press, session.facing, tapTurnsFirst);
    if (action !== undefined) lastActionAt = now;
    session = playTurn(session, terrain, action);
    if (session.position !== previous) {
      glide.moveTo(session.position, scheduled);
      open = opennessAt(session.position);
      syncUrl();
    }
    heading = steer(heading, stepToward({ x: 0, y: 0 }, session.facing));
    chunks.prefetch(session.position, PREFETCH_SPANS * spanOf(natural, zoomModifier) + CHUNK_SIZE);
    natural = naturalSpan(open, heading);
    practical = practicalSpan(open, heading);
    sight = sightAhead(terrain, session.position, session.facing);
    dirty = true;
    nextTurn = Math.max(nextTurn + turnMs, now);
  }
  render(now);
  requestAnimationFrame(frame);
};

addEventListener("keydown", (event) => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction !== undefined && !event.repeat) input.press(direction, performance.now());
  for (const control of controls) if (control.keys.includes(event.code)) control.run();
});
addEventListener("keyup", (event) => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction !== undefined) input.release(direction);
});
let tapped: Direction | undefined;
const tapAt = (event: PointerEvent) => {
  const direction = directionAt(
    { x: event.offsetX, y: event.offsetY },
    { width: canvas.clientWidth, height: canvas.clientHeight },
  );
  if (direction === tapped) return;
  if (tapped !== undefined) input.release(tapped);
  tapped = direction;
  input.press(direction, performance.now());
};
const untap = () => {
  if (tapped !== undefined) input.release(tapped);
  tapped = undefined;
};
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture(event.pointerId);
  tapAt(event);
});
canvas.addEventListener("pointermove", (event) => {
  if (tapped !== undefined) tapAt(event);
});
canvas.addEventListener("pointerup", untap);
canvas.addEventListener("pointercancel", untap);
addEventListener("blur", () => {
  untap();
  Object.values(Direction).forEach(input.release);
});
addEventListener("resize", resize);
addEventListener("wheel", (event) => zoomBy(Math.sign(event.deltaY) * ZOOM_STEP));

resize();
requestAnimationFrame(frame);
