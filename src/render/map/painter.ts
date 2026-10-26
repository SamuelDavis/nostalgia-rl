import type { Vec2 } from "procgen";
import type { ChunkCoord } from "../../game/chunk-store";
import { createTerrain } from "../../game/terrain";
import type { Chunk, Layer } from "../../worldgen";
import type { HeightMode } from "../palette";
import type { MapFrame, Pixels } from "./frame";
import { chunksUnder, localImage } from "./local";

const MAP_PX = 256;
const TILES_PER_PX = 4;
const PLAYER_MARK = "#ff3030";

export interface HeldChunks {
  readonly peek: (layer: Layer, cx: number, cy: number) => Chunk | undefined;
  readonly fetch: (layer: Layer, coords: readonly ChunkCoord[]) => void;
}

export type OverviewOf = (frame: MapFrame, mode: HeightMode) => Promise<Pixels>;

export interface Whereabouts {
  readonly layer: Layer;
  readonly position: Vec2;
}

export const createMapPainter = (canvas: HTMLCanvasElement, overviewOf: OverviewOf, chunks: HeldChunks) => {
  canvas.width = canvas.height = MAP_PX;
  const ctx = canvas.getContext("2d")!;
  let render = 0;

  const drawPlayer = () => {
    ctx.fillStyle = PLAYER_MARK;
    ctx.fillRect(MAP_PX / 2 - 3, MAP_PX / 2 - 1, 7, 3);
    ctx.fillRect(MAP_PX / 2 - 1, MAP_PX / 2 - 3, 3, 7);
  };

  const begin = () => {
    ctx.clearRect(0, 0, MAP_PX, MAP_PX);
    drawPlayer();
    return ++render;
  };

  const show = (id: number, pixels: Pixels) => {
    if (id !== render) return;
    ctx.putImageData(new ImageData(pixels, MAP_PX, MAP_PX), 0, 0);
    drawPlayer();
  };

  const overviewAround = (center: Vec2, mode: HeightMode) =>
    overviewOf({ center, size: MAP_PX, scale: TILES_PER_PX }, mode);

  const prepareOverview = (center: Vec2, mode: HeightMode) => void overviewAround(center, mode);

  const paintOverview = (center: Vec2, mode: HeightMode) => {
    const id = begin();
    void overviewAround(center, mode).then((pixels) => show(id, pixels));
  };

  const paintLocal = ({ layer, position }: Whereabouts, mode: HeightMode) => {
    const id = begin();
    const frame = { center: position, size: MAP_PX, scale: 1 };
    const needed = chunksUnder(frame);
    chunks.fetch(layer, needed);
    const held = (cx: number, cy: number) => chunks.peek(layer, cx, cy);
    const step = () => {
      if (id !== render) return;
      if (!needed.every(({ cx, cy }) => held(cx, cy))) return void requestAnimationFrame(step);
      show(
        id,
        localImage(
          createTerrain((cx, cy) => held(cx, cy)!),
          mode,
          frame,
        ),
      );
    };
    step();
  };

  const stop = () => {
    render++;
  };

  return { prepareOverview, paintOverview, paintLocal, stop };
};
