import { memoize } from "procgen";
import type { MapFrame } from "./render/map/frame";
import { overviewImage } from "./render/map/overview";
import type { HeightMode } from "./render/palette";
import { createWorldgen } from "./worldgen";

export interface OverviewRequest {
  readonly seed: number;
  readonly mode: HeightMode;
  readonly frame: MapFrame;
}

const worldOf = memoize(createWorldgen, String, 1);

addEventListener("message", ({ data: { seed, mode, frame } }: MessageEvent<OverviewRequest>) => {
  const pixels = overviewImage(worldOf(seed), mode, frame);
  postMessage(pixels, { transfer: [pixels.buffer] });
});
