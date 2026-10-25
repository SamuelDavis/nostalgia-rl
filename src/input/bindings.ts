import type { Command } from "../command";
import type { DirectionInput } from "./directions";
import { Direction } from "../game/movement";
import { directionAt } from "./tap";

export interface Shortcut {
  readonly keys: readonly string[];
  readonly hint: string;
  readonly command: Command;
}

export const MOVE_HINT = "WASD or tap move · wheel zoom";

const KEY_DIRECTIONS: Record<string, Direction> = {
  KeyW: Direction.North,
  KeyD: Direction.East,
  KeyS: Direction.South,
  KeyA: Direction.West,
};

export const bindKeys = (input: DirectionInput, shortcuts: readonly Shortcut[]) => {
  addEventListener("keydown", (event) => {
    const direction = KEY_DIRECTIONS[event.code];
    if (direction !== undefined && !event.repeat) input.press(direction, performance.now());
    for (const { keys, command } of shortcuts) if (keys.includes(event.code)) command.run();
  });
  addEventListener("keyup", (event) => {
    const direction = KEY_DIRECTIONS[event.code];
    if (direction !== undefined) input.release(direction);
  });
  addEventListener("blur", () => Object.values(Direction).forEach(input.release));
};

export const bindTaps = (canvas: HTMLCanvasElement, input: DirectionInput) => {
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
  addEventListener("blur", untap);
};

export const bindWheel = (scroll: (sign: number) => void) =>
  addEventListener("wheel", (event) => scroll(Math.sign(event.deltaY)));
