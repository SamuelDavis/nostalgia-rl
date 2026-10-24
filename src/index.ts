import "./index.css";
import type { ChunkRequest } from "./chunk-worker";
import { createChunkStore } from "./game/chunk-store";
import { createTurnClock } from "./game/clock";
import { actionFor, createDirectionInput } from "./game/input";
import { playTurn, startSession } from "./game/session";
import { layersOf } from "./game/terrain";
import { createAddressSync, launchFrom } from "./view/address";
import { bindKeys, bindTaps } from "./view/bindings";
import { createFraming } from "./view/framing";
import { type Control, createHud } from "./view/hud";
import { createMap } from "./view/map";
import { HEIGHT_MODES, type HeightMode } from "./view/palette";
import { createViewport } from "./view/viewport";
import { type Chunk, CHUNK_SIZE, chunkOn, createWorldgen } from "./worldgen";

const ZOOM_STEP = 4;
const PREFETCH_SPANS = 2;

const { seed, turnMs, repeatDelayMs, start } = launchFrom(location.search);
const world = createWorldgen(seed);
const worker = new Worker(new URL("./chunk-worker.ts", import.meta.url), { type: "module" });
const chunks = createChunkStore(
  (layer, cx, cy) => chunkOn(world, layer, cx, cy),
  (layer, cx, cy) => worker.postMessage({ seed, layer, cx, cy } satisfies ChunkRequest),
);
worker.addEventListener("message", ({ data }: MessageEvent<Chunk>) => chunks.receive(data));
const layers = layersOf(world, chunks.chunkAt);
const input = createDirectionInput(repeatDelayMs);
const syncAddress = createAddressSync(seed);

const canvas = document.createElement("canvas");
document.querySelector<HTMLDivElement>("#placeholder")!.replaceWith(canvas);
const ctx = canvas.getContext("2d")!;
const drawViewport = createViewport(ctx);

let session = startSession(start ?? world.spawn);
const here = () => layers.terrainOn(session.layer);
const clock = createTurnClock(turnMs, performance.now());
const framing = createFraming(turnMs, session, here(), performance.now());
let mode: HeightMode = HEIGHT_MODES[0];
let tapTurnsFirst = false;
let dirty = true;
let drawn = "";

const render = (now: number) => {
  const { view, shown, angle, eyeLevel, zoom } = framing.frame(now, session, here(), {
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  });
  const placement = [view.centre.x, view.centre.y, shown.x, shown.y]
    .map((v) => v * view.tilePx)
    .concat(view.tilePx * 100, eyeLevel * 100, angle * 100)
    .map(Math.round)
    .join();
  if (!dirty && placement === drawn) return;
  drawViewport(here(), view, { layer: session.layer, position: session.position, shown, eyeLevel, angle }, mode);
  hud.update({
    session,
    turnMs,
    tile: here()(session.position.x, session.position.y),
    mode,
    zoom,
    tapTurnsFirst,
  });
  drawn = placement;
  dirty = false;
};

const playDueTurn = (now: number) => {
  const scheduled = clock.due(now);
  if (scheduled === undefined) return;
  const previous = session.position;
  const press = input.take(now);
  const action = press && actionFor(press, session.facing, tapTurnsFirst);
  session = playTurn(session, layers, action);
  const moved = session.position !== previous;
  if (moved) syncAddress(session.position);
  framing.turned({ session, terrain: here(), scheduled, moved, acted: action !== undefined });
  chunks.prefetch(session.layer, session.position, PREFETCH_SPANS * framing.naturalSpan() + CHUNK_SIZE);
  dirty = true;
};

const zoomBy = (delta: number) => {
  framing.zoomBy(delta);
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
  { keys: ["KeyM"], label: "M map", run: () => map.cycle(session, mode) },
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
const map = createMap(document.body, world, chunks);

const resize = () => {
  const ratio = devicePixelRatio;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  dirty = true;
};

const frame = (now: number) => {
  playDueTurn(now);
  render(now);
  requestAnimationFrame(frame);
};

bindKeys(input, controls);
bindTaps(canvas, input);
addEventListener("resize", resize);
addEventListener("wheel", (event) => zoomBy(Math.sign(event.deltaY) * ZOOM_STEP));
resize();
requestAnimationFrame(frame);
