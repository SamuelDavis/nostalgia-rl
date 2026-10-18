import { type Point, hash, hashString, unit } from "../lib";
import type { View } from "./camera";
import { isCliff, isStairs, isTrail } from "../game/movement";
import type { Terrain, Tile } from "../game/terrain";
import { Cover, type Layer, Prop, Water, Way, layerKey } from "../worldgen";
import {
  PLAYER_GLYPH,
  STAIRS_GLYPH,
  THRESHOLD_GLYPH,
  coverGlyph,
  propGlyph,
  groundGlyph,
  waterGlyph,
  wayGlyph,
} from "./glyphs";
import {
  type Contour,
  type HeightMode,
  type HeightShade,
  UNSHADED,
  type Rgb,
  contourBetween,
  reliefTint,
  coverColor,
  css,
  hillshade,
  propColor,
  groundColor,
  shade,
  surfaceColor,
  waterColor,
  wayColor,
} from "./palette";

const CLIFF_COLOR = "rgb(20 15 10 / 0.85)";
const CLIFF_WIDTH = 3;
const PLAYER_COLOR: Rgb = [255, 255, 255];
const GROUND_GLYPH_SHADE = 0.8;
const PATH_VISIBILITY = 0.6;
const PATH_SALT = hashString("path glyphs");
const COVER_SALT = hashString("cover glyphs");
const COVER_GLYPH_SHARE = 0.5;
const COVER_GLYPH_SHADE = 1.4;
const UNDER_COVER_SHADE = 0.7;
const SLOPE_REACH = 3;
const CONTOUR_STYLE: Record<Exclude<Contour, "none">, { readonly color: string; readonly width: number }> = {
  minor: { color: "rgb(150 95 40 / 0.3)", width: 1 },
  index: { color: "rgb(150 95 40 / 0.7)", width: 1 },
};

interface Look {
  readonly background: Rgb;
  readonly glyph: string;
  readonly color: Rgb;
}

const NEIGHBOURS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const THRESHOLD: Look = { background: [55, 38, 20], glyph: THRESHOLD_GLYPH, color: [255, 215, 130] };

const isThreshold = (terrain: Terrain, x: number, y: number, tile: Tile): boolean =>
  isTrail(tile) &&
  tile.cover === Cover.None &&
  NEIGHBOURS.some((o) => {
    const next = terrain(x + o.x, y + o.y);
    return isTrail(next) && next.cover !== Cover.None;
  });

const CLIFF_FACE: Look = { background: [72, 64, 60], glyph: "", color: [0, 0, 0] };
const FACE_MIN_CLIFF_SIDES = 3;

const isCliffFace = (terrain: Terrain, x: number, y: number, tile: Tile): boolean =>
  NEIGHBOURS.filter((o) => isCliff(tile, terrain(x + o.x, y + o.y))).length >= FACE_MIN_CLIFF_SIDES;

const hasStairs = (terrain: Terrain, x: number, y: number, tile: Tile): boolean =>
  isTrail(tile) && NEIGHBOURS.some((o) => isStairs(tile, terrain(x + o.x, y + o.y)));

const isPathShown = (x: number, y: number) => unit(hash(PATH_SALT, x, y)) < PATH_VISIBILITY;

const SNAPSHOT_MARGIN = SLOPE_REACH + 2;

const snapshot = (terrain: Terrain, left: number, top: number, columns: number, rows: number): Terrain => {
  const tiles = Array.from({ length: columns * rows }, (_, i) =>
    terrain(left + (i % columns), top + Math.floor(i / columns)),
  );
  return (x, y) => {
    const [i, j] = [x - left, y - top];
    return i >= 0 && i < columns && j >= 0 && j < rows ? tiles[j * columns + i]! : terrain(x, y);
  };
};

const createLighting = (terrain: Terrain, left: number, top: number, columns: number, rows: number) => {
  const originX = left - SLOPE_REACH;
  const originY = top - SLOPE_REACH;
  const width = columns + 2 * SLOPE_REACH + 1;
  const stride = width + 1;
  const sums = new Float64Array(stride * (rows + 2 * SLOPE_REACH + 2));
  for (let j = 0; j < rows + 2 * SLOPE_REACH + 1; j++)
    for (let i = 0; i < width; i++)
      sums[(j + 1) * stride + i + 1] =
        terrain(originX + i, originY + j).height +
        sums[j * stride + i + 1]! +
        sums[(j + 1) * stride + i]! -
        sums[j * stride + i]!;
  const meanHeight = (x0: number, y0: number, x1: number, y1: number) => {
    const [i0, j0, i1, j1] = [x0 - originX, y0 - originY, x1 - originX + 1, y1 - originY + 1];
    const total = sums[j1 * stride + i1]! - sums[j0 * stride + i1]! - sums[j1 * stride + i0]! + sums[j0 * stride + i0]!;
    return total / ((i1 - i0) * (j1 - j0));
  };
  const r = SLOPE_REACH;
  return (x: number, y: number): number =>
    hillshade(
      (meanHeight(x + 1, y - r, x + r, y + r) - meanHeight(x - r, y - r, x - 1, y + r)) / (r + 1),
      (meanHeight(x - r, y + 1, x + r, y + r) - meanHeight(x - r, y - r, x + r, y - 1)) / (r + 1),
    );
};

const lookOf = (tile: Tile, mode: HeightMode, light: number, heightShade: HeightShade, x: number, y: number): Look => {
  const surface = tile.way === Way.Road ? wayColor[Way.Road] : groundColor[tile.ground];
  const surfaceBackground = () => surfaceColor(mode, surface, tile.height, light, heightShade);
  if (tile.prop === Prop.Rock) return { background: propColor[Prop.Rock], glyph: "", color: propColor[Prop.Rock] };
  if (tile.prop !== Prop.None) {
    const background = tile.water === Water.None ? surfaceBackground() : waterColor[tile.water];
    return { background, glyph: propGlyph[tile.prop], color: propColor[tile.prop] };
  }
  if (tile.water !== Water.None) {
    const background = waterColor[tile.water];
    return { background, glyph: waterGlyph[tile.water], color: shade(background, 1.4) };
  }
  const background = surfaceBackground();
  if (tile.way === Way.Road || (tile.way === Way.Path && isPathShown(x, y)))
    return { background, glyph: wayGlyph[tile.way], color: wayColor[tile.way] };
  const color = mode === "tint" ? groundColor[tile.ground] : shade(background, GROUND_GLYPH_SHADE);
  return { background, glyph: groundGlyph[tile.ground], color };
};

const coverLook = (cover: Exclude<Cover, typeof Cover.None>, light: number, x: number, y: number): Look => {
  const background = shade(coverColor[cover], light);
  const glyph = unit(hash(COVER_SALT, x, y)) < COVER_GLYPH_SHARE ? coverGlyph[cover] : "";
  return { background, glyph, color: shade(background, COVER_GLYPH_SHADE) };
};

const underCover = (look: Look): Look => ({ ...look, background: shade(look.background, UNDER_COVER_SHADE) });

const setGlyphFont = (ctx: CanvasRenderingContext2D, cellPx: number) => {
  ctx.font = `${cellPx - 3}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
};

const SPRITE_BACKDROP = "rgb(0 0 0 / 0.4)";
const SPRITE_BACKDROP_RADIUS = 0.45;

const drawSprite = (
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cellPx: number,
  glyph: string,
  color: Rgb,
  angle: number,
) => {
  const [cx, cy] = [px + cellPx / 2, py + cellPx / 2];
  ctx.fillStyle = SPRITE_BACKDROP;
  ctx.beginPath();
  ctx.arc(cx, cy, cellPx * SPRITE_BACKDROP_RADIUS, 0, 2 * Math.PI);
  ctx.fill();
  setGlyphFont(ctx, cellPx);
  ctx.fillStyle = css(color);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillText(glyph, 0, 1);
  ctx.restore();
};

export interface Player {
  readonly layer: Layer;
  readonly position: Point;
  readonly shown: Point;
  readonly eyeLevel: number;
  readonly angle: number;
}

interface TileWindow {
  readonly left: number;
  readonly top: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellPx: number;
}

const drawTiles = (
  ctx: CanvasRenderingContext2D,
  source: Terrain,
  { left, top, columns, rows, cellPx }: TileWindow,
  isInside: boolean,
  mode: HeightMode,
): Float32Array => {
  const terrain = snapshot(
    source,
    left - SNAPSHOT_MARGIN,
    top - SNAPSHOT_MARGIN,
    columns + 2 * SNAPSHOT_MARGIN,
    rows + 2 * SNAPSHOT_MARGIN,
  );
  const screen = (x: number, y: number) => ({ px: (x - left) * cellPx, py: (y - top) * cellPx });

  setGlyphFont(ctx, cellPx);

  const isHidden = (tile: Tile) => !isInside && tile.cover !== Cover.None;
  const lightAt = createLighting(terrain, left, top, columns, rows);
  const lookAt = (tile: Tile, x: number, y: number): Look => {
    if (tile.cover !== Cover.None && !isInside) return coverLook(tile.cover, lightAt(x, y), x, y);
    if (isThreshold(terrain, x, y, tile)) return THRESHOLD;
    const look = isCliffFace(terrain, x, y, tile) ? CLIFF_FACE : lookOf(tile, mode, lightAt(x, y), UNSHADED, x, y);
    return tile.cover === Cover.None ? look : underCover(look);
  };
  const reliefLevels = new Float32Array(columns * rows);
  for (let y = top; y < top + rows; y++)
    for (let x = left; x < left + columns; x++) {
      const { px, py } = screen(x, y);
      const tile = terrain(x, y);
      const look = lookAt(tile, x, y);
      reliefLevels[(y - top) * columns + x - left] =
        isHidden(tile) || tile.water !== Water.None ? Number.NaN : tile.height;
      ctx.fillStyle = css(look.background);
      ctx.fillRect(px, py, cellPx, cellPx);
      const stairs = !isHidden(tile) && hasStairs(terrain, x, y, tile);
      ctx.fillStyle = css(look.color);
      ctx.fillText(stairs ? STAIRS_GLYPH : look.glyph, px + cellPx / 2, py + cellPx / 2 + 1);
    }

  const contourAt = (tile: Tile, next: Tile): Contour =>
    tile.water !== Water.None || next.water !== Water.None || isCliff(tile, next) || isHidden(tile) || isHidden(next)
      ? "none"
      : contourBetween(tile.height, next.height);
  for (const [contour, style] of Object.entries(CONTOUR_STYLE)) {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.beginPath();
    for (let y = top - 1; y < top + rows; y++)
      for (let x = left - 1; x < left + columns; x++) {
        const tile = terrain(x, y);
        const { px, py } = screen(x + 1, y + 1);
        if (contourAt(tile, terrain(x + 1, y)) === contour) {
          ctx.moveTo(px, py - cellPx);
          ctx.lineTo(px, py);
        }
        if (contourAt(tile, terrain(x, y + 1)) === contour) {
          ctx.moveTo(px - cellPx, py);
          ctx.lineTo(px, py);
        }
      }
    ctx.stroke();
  }

  ctx.strokeStyle = CLIFF_COLOR;
  ctx.lineWidth = CLIFF_WIDTH;
  ctx.beginPath();
  for (let y = top - 1; y < top + rows; y++)
    for (let x = left - 1; x < left + columns; x++) {
      const tile = terrain(x, y);
      const { px, py } = screen(x + 1, y + 1);
      const face = isCliffFace(terrain, x, y, tile);
      const edgeShown = (nx: number, ny: number) => {
        const next = terrain(nx, ny);
        if (isHidden(tile) || isHidden(next)) return false;
        return isCliff(tile, next) && !(face && isCliffFace(terrain, nx, ny, next));
      };
      if (edgeShown(x + 1, y)) {
        ctx.moveTo(px, py - cellPx);
        ctx.lineTo(px, py);
      }
      if (edgeShown(x, y + 1)) {
        ctx.moveTo(px - cellPx, py);
        ctx.lineTo(px, py);
      }
    }
  ctx.stroke();
  return reliefLevels;
};

const LAYER_MARGIN_SHARE = 0.25;
const MIN_LAYER_MARGIN = 2;
const LAYER_RESOLUTIONS = [8, 11, 16, 23, 32, 45, 64, 91, 128];
const MAX_UPSCALE = 1.5;
const resolutionFor = (tilePx: number) => LAYER_RESOLUTIONS.find((px) => px >= tilePx) ?? tilePx;

interface Drawn {
  readonly area: TileWindow;
  readonly key: string;
  readonly reliefLevels: Float32Array;
}

const paintRelief = (
  relief: CanvasRenderingContext2D,
  { columns, rows }: TileWindow,
  levels: Float32Array,
  eyeLevel: number,
) => {
  const image = relief.createImageData(columns, rows);
  levels.forEach((level, i) => {
    if (Number.isNaN(level)) return;
    const [r, g, b, a] = reliefTint(level - eyeLevel);
    image.data.set([r, g, b, Math.round(a * 255)], i * 4);
  });
  relief.putImageData(image, 0, 0);
};

const covers = (area: TileWindow, left: number, top: number, columns: number, rows: number) =>
  area.left <= left &&
  area.top <= top &&
  area.left + area.columns >= left + columns &&
  area.top + area.rows >= top + rows;

export const createViewport = (ctx: CanvasRenderingContext2D) => {
  const layer = document.createElement("canvas").getContext("2d")!;
  const relief = document.createElement("canvas").getContext("2d")!;
  let drawn: Drawn | undefined;
  let reliefPainted = "";
  return (terrain: Terrain, { centre, tilePx, restingTilePx }: View, player: Player, mode: HeightMode): void => {
    const { clientWidth: width, clientHeight: height } = ctx.canvas;
    const visibleLeft = centre.x - width / 2 / tilePx;
    const visibleTop = centre.y - height / 2 / tilePx;
    const eye = terrain(player.position.x, player.position.y);
    const key = [devicePixelRatio, eye.cover, mode, layerKey(player.layer)].join();
    const isSharp = (cellPx: number) =>
      (tilePx > restingTilePx || tilePx <= cellPx * MAX_UPSCALE) &&
      (tilePx !== restingTilePx || cellPx === resolutionFor(restingTilePx));
    const isCurrent =
      drawn?.key === key &&
      isSharp(drawn.area.cellPx) &&
      covers(drawn.area, visibleLeft, visibleTop, width / tilePx, height / tilePx);
    if (!isCurrent) {
      const widestTilePx = Math.min(tilePx, restingTilePx);
      const cellPx = resolutionFor(widestTilePx);
      const margin = Math.max(
        MIN_LAYER_MARGIN,
        Math.ceil((LAYER_MARGIN_SHARE * Math.min(width, height)) / widestTilePx),
      );
      const area: TileWindow = {
        left: Math.floor(visibleLeft) - margin,
        top: Math.floor(visibleTop) - margin,
        columns: Math.ceil(width / widestTilePx) + 1 + 2 * margin,
        rows: Math.ceil(height / widestTilePx) + 1 + 2 * margin,
        cellPx,
      };
      layer.canvas.width = Math.round(area.columns * cellPx * devicePixelRatio);
      layer.canvas.height = Math.round(area.rows * cellPx * devicePixelRatio);
      layer.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      const reliefLevels = drawTiles(layer, terrain, area, eye.cover !== Cover.None, mode);
      relief.canvas.width = area.columns;
      relief.canvas.height = area.rows;
      drawn = { area, key, reliefLevels };
      reliefPainted = "";
    }
    const { area, reliefLevels } = drawn!;
    const originX = Math.round(width / 2 - (centre.x - area.left) * tilePx);
    const originY = Math.round(height / 2 - (centre.y - area.top) * tilePx);
    ctx.drawImage(layer.canvas, originX, originY, area.columns * tilePx, area.rows * tilePx);
    if (mode === "shade") {
      const eyeLevel = player.eyeLevel.toFixed(2);
      if (reliefPainted !== eyeLevel) {
        paintRelief(relief, area, reliefLevels, player.eyeLevel);
        reliefPainted = eyeLevel;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(relief.canvas, originX, originY, area.columns * tilePx, area.rows * tilePx);
      ctx.imageSmoothingEnabled = true;
    }
    const toScreen = (p: number, centreAt: number, extent: number) => extent / 2 + (p - centreAt) * tilePx;
    drawSprite(
      ctx,
      toScreen(player.shown.x, centre.x, width),
      toScreen(player.shown.y, centre.y, height),
      tilePx,
      PLAYER_GLYPH,
      PLAYER_COLOR,
      player.angle,
    );
  };
};
