import { writeFileSync } from "node:fs";
import { PNG } from "pngjs";

export type Rgb = readonly [number, number, number];

export const writePng = (path: string, width: number, height: number, colorAt: (x: number, y: number) => Rgb): void => {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const i = (y * width + x) * 4;
      png.data[i] = r;
      png.data[i + 1] = g;
      png.data[i + 2] = b;
      png.data[i + 3] = 255;
    }
  writeFileSync(path, PNG.sync.write(png));
};
