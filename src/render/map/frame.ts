import type { Vec2 } from "procgen";
import type { Rgb } from "../palette";

export interface MapFrame {
  readonly center: Vec2;
  readonly size: number;
  readonly scale: number;
}

export const pixelOf = ({ center, size, scale }: MapFrame, p: Vec2) => ({
  col: Math.round((p.x - center.x) / scale + size / 2),
  row: Math.round((p.y - center.y) / scale + size / 2),
});

export const pointAt = ({ center, size, scale }: MapFrame, col: number, row: number): Vec2 => ({
  x: center.x + (col - size / 2) * scale,
  y: center.y + (row - size / 2) * scale,
});

export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export const createPixels = (size: number) => {
  const data: Pixels = new Uint8ClampedArray(size * size * 4);
  const set = (col: number, row: number, [r, g, b]: Rgb) => {
    if (col < 0 || row < 0 || col >= size || row >= size) return;
    data.set([r, g, b, 255], (row * size + col) * 4);
  };
  return { data, set };
};
