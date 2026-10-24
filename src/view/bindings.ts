import type { DirectionInput } from "../game/input";
import { Direction } from "../game/movement";
import type { Control } from "./hud";
import { directionAt } from "./tap";

const KEY_DIRECTIONS: Record<string, Direction> = {
  KeyW: Direction.North,
  KeyD: Direction.East,
  KeyS: Direction.South,
  KeyA: Direction.West,
};

export const bindKeys = (input: DirectionInput, controls: readonly Control[]) => {
  addEventListener("keydown", (event) => {
    const direction = KEY_DIRECTIONS[event.code];
    if (direction !== undefined && !event.repeat) input.press(direction, performance.now());
    for (const control of controls) if (control.keys.includes(event.code)) control.run();
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
