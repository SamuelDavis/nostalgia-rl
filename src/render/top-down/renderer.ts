import { CHUNK_SIZE, layerKey } from "../../worldgen";
import { createMotion } from "../motion";
import type { HeightMode } from "../palette";
import type { Renderer, Stage } from "../renderer";
import { type Zoom, createFraming } from "./framing";
import { createViewport } from "./viewport";

const PREFETCH_SPANS = 2;

export interface TopDown extends Renderer {
  readonly zoomBy: (delta: number) => void;
  readonly zoom: () => Zoom;
  readonly showHeightAs: (mode: HeightMode) => void;
}

const fitBacking = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): boolean => {
  const ratio = devicePixelRatio;
  const [width, height] = [Math.round(canvas.clientWidth * ratio), Math.round(canvas.clientHeight * ratio)];
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return true;
};

export const createTopDown = (
  canvas: HTMLCanvasElement,
  { layers, session: start, turnMs, now }: Stage,
  mode: HeightMode,
): TopDown => {
  const ctx = canvas.getContext("2d")!;
  const drawViewport = createViewport(ctx);
  let session = start;
  const here = () => layers.terrainOn(session.layer);
  const motion = createMotion(turnMs, start, here(), now);
  const framing = createFraming(start, here(), now);
  let zoom: Zoom = { span: framing.naturalSpan(), natural: framing.naturalSpan(), modifier: 0 };
  let drawn = "";

  return {
    turned: (turn) => {
      session = turn.session;
      motion.turned(turn);
      framing.turned(turn, here());
    },
    draw: (now) => {
      const resized = fitBacking(canvas, ctx);
      const { shown, angle, eyeLevel } = motion.poseAt(now, session, here());
      const framed = framing.frame(now, shown, { width: canvas.clientWidth, height: canvas.clientHeight });
      const { view } = framed;
      zoom = framed.zoom;
      const placement = [view.centre.x, view.centre.y, shown.x, shown.y]
        .map((v) => v * view.tilePx)
        .concat(view.tilePx * 100, eyeLevel * 100, angle * 100, session.position.x, session.position.y)
        .map(Math.round)
        .join()
        .concat(mode, layerKey(session.layer));
      if (!resized && placement === drawn) return;
      drawViewport(here(), view, { layer: session.layer, position: session.position, shown, eyeLevel, angle }, mode);
      drawn = placement;
    },
    reach: () => PREFETCH_SPANS * framing.naturalSpan() + CHUNK_SIZE,
    zoomBy: (delta) => framing.zoomBy(delta),
    zoom: () => zoom,
    showHeightAs: (next) => {
      mode = next;
    },
  };
};
