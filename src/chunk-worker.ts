import { memoize } from "./lib";
import { createWorldgen, generateChunk } from "./worldgen";

export interface ChunkRequest {
  readonly seed: number;
  readonly cx: number;
  readonly cy: number;
}

const worldOf = memoize(createWorldgen, String, 1);

addEventListener("message", ({ data: { seed, cx, cy } }: MessageEvent<ChunkRequest>) =>
  postMessage(generateChunk(worldOf(seed), cx, cy)),
);
