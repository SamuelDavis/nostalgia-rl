import { memoize } from "procgen";
import { type Layer, chunkOn, createWorldgen } from "./worldgen";

export interface ChunkRequest {
  readonly seed: number;
  readonly layer: Layer;
  readonly cx: number;
  readonly cy: number;
}

const worldOf = memoize(createWorldgen, String, 1);

addEventListener("message", ({ data: { seed, layer, cx, cy } }: MessageEvent<ChunkRequest>) =>
  postMessage(chunkOn(worldOf(seed), layer, cx, cy)),
);
