import type { Point } from "../lib";
import { type Worldgen, heightLevel } from "../worldgen";
import { fieldColor, overviewMarks } from "./overview";
import { type HeightMode, css } from "./palette";

const MAP_PX = 256;
const TILES_PER_PX = 4;
const ROWS_PER_FRAME = 16;
const PLAYER_MARK = "#ff3030";

export const createMap = (parent: HTMLElement, world: Worldgen) => {
  const canvas = document.createElement("canvas");
  canvas.className = "map";
  canvas.width = canvas.height = MAP_PX;
  canvas.hidden = true;
  parent.append(canvas);
  const ctx = canvas.getContext("2d")!;
  let render = 0;

  const toPixel = (center: Point, p: Point) => ({
    px: Math.round((p.x - center.x) / TILES_PER_PX + MAP_PX / 2),
    py: Math.round((p.y - center.y) / TILES_PER_PX + MAP_PX / 2),
  });

  const drawMarks = (center: Point) => {
    for (const { point, color } of overviewMarks(world, center, (MAP_PX * TILES_PER_PX) / 2)) {
      const { px, py } = toPixel(center, point);
      ctx.fillStyle = css(color);
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.fillStyle = PLAYER_MARK;
    ctx.fillRect(MAP_PX / 2 - 3, MAP_PX / 2 - 1, 7, 3);
    ctx.fillRect(MAP_PX / 2 - 1, MAP_PX / 2 - 3, 3, 7);
  };

  const draw = (center: Point, mode: HeightMode) => {
    const id = ++render;
    const image = ctx.createImageData(MAP_PX, MAP_PX);
    let row = 0;
    let previous: number[] = [];
    const step = () => {
      if (id !== render) return;
      for (const end = Math.min(MAP_PX, row + ROWS_PER_FRAME); row < end; row++) {
        const levels: number[] = [];
        for (let col = 0; col < MAP_PX; col++) {
          const climate = world.fields.climate(
            center.x + (col - MAP_PX / 2) * TILES_PER_PX,
            center.y + (row - MAP_PX / 2) * TILES_PER_PX,
          );
          const level = heightLevel(climate.elevation);
          levels.push(level);
          const [r, g, b] = fieldColor(mode, climate, {
            westLevel: levels[col - 1] ?? level,
            northLevel: previous[col] ?? level,
            spacing: TILES_PER_PX,
          });
          image.data.set([r, g, b, 255], (row * MAP_PX + col) * 4);
        }
        previous = levels;
      }
      ctx.putImageData(image, 0, 0);
      if (row < MAP_PX) requestAnimationFrame(step);
      else drawMarks(center);
    };
    step();
  };

  const toggle = (center: Point, mode: HeightMode) => {
    canvas.hidden = !canvas.hidden;
    if (canvas.hidden) render++;
    else draw(center, mode);
  };

  return { toggle };
};
