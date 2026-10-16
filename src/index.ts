import "./index.css";
import { createDirectionInput } from "./game/input";
import { type Blocker, Direction, blockerBetween, stepToward } from "./game/movement";
import { createTerrain } from "./game/terrain";
import { createHud } from "./view/hud";
import { createMap } from "./view/map";
import { HEIGHT_MODES, type HeightMode } from "./view/palette";
import { drawViewport } from "./view/viewport";
import { createWorldgen } from "./worldgen";

const DEFAULT_TURN_MS = 100;

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

let position = {
  x: Number(params.get("x") ?? world.spawn.x),
  y: Number(params.get("y") ?? world.spawn.y),
};
let facing: Direction = Direction.South;
let blocked: Blocker | undefined;
let mode: HeightMode = HEIGHT_MODES[0];
let turn = 0;

const render = () => {
  drawViewport(ctx, terrain, position, mode);
  hud.update({ turn, turnMs, position, facing, tile: terrain(position.x, position.y), blocked, mode });
};

const resize = () => {
  const ratio = devicePixelRatio;
  canvas.width = Math.round(canvas.clientWidth * ratio);
  canvas.height = Math.round(canvas.clientHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  render();
};

const playTurn = () => {
  turn++;
  const direction = input.take();
  if (direction !== undefined) {
    facing = direction;
    const target = stepToward(position, direction);
    blocked = blockerBetween(terrain(position.x, position.y), terrain(target.x, target.y));
    if (!blocked) position = target;
  }
  render();
};

let nextTurn = performance.now() + turnMs;
const frame = (now: number) => {
  if (now >= nextTurn) {
    playTurn();
    nextTurn = Math.max(nextTurn + turnMs, now);
  }
  requestAnimationFrame(frame);
};

addEventListener("keydown", (event) => {
  const direction = KEY_DIRECTIONS[event.code];
  if (direction !== undefined && !event.repeat) input.press(direction);
  if (event.code === "KeyM") map.toggle(position, mode);
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
