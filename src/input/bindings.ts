import type { Command } from "../command";
import type { DirectionInput } from "./directions";
import { Heading } from "../game/movement";
import { headingAt } from "./tap";

export interface Shortcut {
  readonly keys: readonly string[];
  readonly hint: string;
  readonly command: Command;
}

export const MOVE_HINT = "WASD or tap move · wheel zoom";

const KEY_HEADINGS: Record<string, Heading> = {
  KeyW: Heading.North,
  KeyD: Heading.East,
  KeyS: Heading.South,
  KeyA: Heading.West,
};

export const bindKeys = (input: DirectionInput, shortcuts: readonly Shortcut[]) => {
  addEventListener("keydown", (event) => {
    const heading = KEY_HEADINGS[event.code];
    if (heading !== undefined && !event.repeat) input.press(heading, performance.now());
    for (const { keys, command } of shortcuts) if (keys.includes(event.code)) command.run();
  });
  addEventListener("keyup", (event) => {
    const heading = KEY_HEADINGS[event.code];
    if (heading !== undefined) input.release(heading);
  });
  addEventListener("blur", () => Object.values(Heading).forEach(input.release));
};

export const bindTaps = (canvas: HTMLCanvasElement, input: DirectionInput) => {
  let tapped: Heading | undefined;
  const tapAt = (event: PointerEvent) => {
    const heading = headingAt(
      { x: event.offsetX, y: event.offsetY },
      { width: canvas.clientWidth, height: canvas.clientHeight },
    );
    if (heading === tapped) return;
    if (tapped !== undefined) input.release(tapped);
    tapped = heading;
    input.press(heading, performance.now());
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
