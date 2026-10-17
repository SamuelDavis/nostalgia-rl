import "./index.css";
import { createDirectionInput } from "./game/input";
import { Direction } from "./game/movement";
import { playTurn, startSession } from "./game/session";
import { createTerrain } from "./game/terrain";
import { createHud } from "./view/hud";
import { createMap } from "./view/map";
import { HEIGHT_MODES, type HeightMode } from "./view/palette";
import { drawViewport } from "./view/viewport";
import { createWorldgen } from "./worldgen";

const DEFAULT_TURN_MS = 100;
const URL_SYNC_DELAY_MS = 300;

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

const render = () => {
  drawViewport(ctx, terrain, session.position, mode);
  hud.update({ session, turnMs, tile: terrain(session.position.x, session.position.y), mode });
};

const resize = () => {
  const ratio = devicePixelRatio;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  render();
};

let nextTurn = performance.now() + turnMs;
const frame = (now: number) => {
  if (now >= nextTurn) {
    const previous = session.position;
    session = playTurn(session, terrain, input.take());
    if (session.position !== previous) syncUrl();
    render();
    nextTurn = Math.max(nextTurn + turnMs, now);
  }
  requestAnimationFrame(frame);
};

addEventListener("keydown", (event) => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction !== undefined && !event.repeat) input.press(direction);
  if (event.code === "KeyM") map.toggle(session.position, mode);
  if (event.code === "KeyH") {
    mode = HEIGHT_MODES[(HEIGHT_MODES.indexOf(mode) + 1) % HEIGHT_MODES.length]!;
    render();
  }
});
addEventListener("keyup", (event) => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction !== undefined) input.release(direction);
});
addEventListener("blur", () => Object.values(Direction).forEach(input.release));
addEventListener("resize", resize);

resize();
requestAnimationFrame(frame);
