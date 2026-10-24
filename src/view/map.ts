import { type Vec2, floorDiv } from "procgen";
import { createTerrain } from "../game/terrain";
import { CHUNK_SIZE, type Chunk, type Layer, type Worldgen, heightLevel } from "../worldgen";
import { createOverviewTint, fieldColor, overviewMarks } from "./overview";
import { type HeightMode, css, hillshade, mapColorOf } from "./palette";

const MAP_PX = 256;
const TILES_PER_PX = 4;
const ROWS_PER_FRAME = 16;
const MAP_RADIUS = (MAP_PX * TILES_PER_PX) / 2;
const PLAYER_MARK = "#ff3030";
const LOCAL_RADIUS = MAP_PX / 2;
const LOCAL_REACH = LOCAL_RADIUS * Math.SQRT2 + 2 * CHUNK_SIZE;

const MAP_VIEWS = ["closed", "overview", "local"] as const;
type MapView = (typeof MAP_VIEWS)[number];

interface HeldChunks {
  readonly peek: (layer: Layer, cx: number, cy: number) => Chunk | undefined;
  readonly prefetch: (layer: Layer, p: Vec2, reach: number) => void;
}

interface Whereabouts {
  readonly layer: Layer;
  readonly position: Vec2;
}

export const createMap = (parent: HTMLElement, world: Worldgen, chunks: HeldChunks) => {
  const canvas = document.createElement("canvas");
  canvas.className = "map";
  canvas.width = canvas.height = MAP_PX;
  canvas.hidden = true;
  parent.append(canvas);
  const ctx = canvas.getContext("2d")!;
  let render = 0;
  let view: MapView = "closed";

  const toPixel = (center: Vec2, p: Vec2) => ({
    px: Math.round((p.x - center.x) / TILES_PER_PX + MAP_PX / 2),
    py: Math.round((p.y - center.y) / TILES_PER_PX + MAP_PX / 2),
  });

  const drawMarks = (center: Vec2) => {
    for (const { point, color, radius } of overviewMarks(world, center, MAP_RADIUS)) {
      const { px, py } = toPixel(center, point);
      ctx.fillStyle = css(color);
      ctx.fillRect(px - radius, py - radius, 2 * radius + 1, 2 * radius + 1);
    }
    drawPlayer();
  };

  const drawPlayer = () => {
    ctx.fillStyle = PLAYER_MARK;
    ctx.fillRect(MAP_PX / 2 - 3, MAP_PX / 2 - 1, 7, 3);
    ctx.fillRect(MAP_PX / 2 - 1, MAP_PX / 2 - 3, 3, 7);
  };

  const draw = (center: Vec2, mode: HeightMode) => {
    const id = ++render;
    const tint = createOverviewTint(world, center, MAP_RADIUS, TILES_PER_PX);
    const image = ctx.createImageData(MAP_PX, MAP_PX);
    let row = 0;
    let previous: number[] = [];
    const step = () => {
      if (id !== render) return;
      for (const end = Math.min(MAP_PX, row + ROWS_PER_FRAME); row < end; row++) {
        const levels: number[] = [];
        for (let col = 0; col < MAP_PX; col++) {
          const at = {
            x: center.x + (col - MAP_PX / 2) * TILES_PER_PX,
            y: center.y + (row - MAP_PX / 2) * TILES_PER_PX,
          };
          const conditions = world.fields.conditions(at.x, at.y);
          const level = heightLevel(conditions.elevation);
          levels.push(level);
          const [r, g, b] = tint(
            fieldColor(mode, conditions, {
              westLevel: levels[col - 1] ?? level,
              northLevel: previous[col] ?? level,
              spacing: TILES_PER_PX,
            }),
            at,
          );
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

  const drawLocal = ({ layer, position }: Whereabouts, mode: HeightMode) => {
    const id = ++render;
    chunks.prefetch(layer, position, LOCAL_REACH);
    const [left, top] = [position.x - LOCAL_RADIUS, position.y - LOCAL_RADIUS];
    const image = ctx.createImageData(MAP_PX, MAP_PX);
    const span = floorDiv(left + MAP_PX - 1, CHUNK_SIZE) - floorDiv(left, CHUNK_SIZE) + 1;
    let pending = Array.from({ length: span * span }, (_, i) => ({
      cx: floorDiv(left, CHUNK_SIZE) + (i % span),
      cy: floorDiv(top, CHUNK_SIZE) + Math.floor(i / span),
    }));
    const isHeld = (cx: number, cy: number) => chunks.peek(layer, cx, cy) !== undefined;
    const terrain = createTerrain((cx, cy) => chunks.peek(layer, cx, cy)!);
    const paint = (cx: number, cy: number) => {
      for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++)
        for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
          const [col, row] = [x - left, y - top];
          if (col < 0 || row < 0 || col >= MAP_PX || row >= MAP_PX) continue;
          const tile = terrain(x, y);
          const light = hillshade(tile.height - terrain(x - 1, y).height, tile.height - terrain(x, y - 1).height);
          const [r, g, b] = mapColorOf(tile, mode, light);
          image.data.set([r, g, b, 255], (row * MAP_PX + col) * 4);
        }
    };
    const step = () => {
      if (id !== render) return;
      const ready = pending.filter(({ cx, cy }) => isHeld(cx, cy) && isHeld(cx - 1, cy) && isHeld(cx, cy - 1));
      ready.forEach(({ cx, cy }) => paint(cx, cy));
      pending = pending.filter((c) => !ready.includes(c));
      ctx.putImageData(image, 0, 0);
      drawPlayer();
      if (pending.length > 0) requestAnimationFrame(step);
    };
    step();
  };

  const cycle = (whereabouts: Whereabouts, mode: HeightMode) => {
    view = MAP_VIEWS[(MAP_VIEWS.indexOf(view) + 1) % MAP_VIEWS.length]!;
    canvas.hidden = view === "closed";
    if (view === "closed") render++;
    if (view === "overview") draw(whereabouts.position, mode);
    if (view === "local") drawLocal(whereabouts, mode);
  };

  return { cycle };
};
