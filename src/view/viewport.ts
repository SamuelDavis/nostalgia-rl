import { type Point, hash, hashString, unit } from "../lib";
import { isCliff, isStairs, isTrail } from "../game/movement";
import type { Terrain, Tile } from "../game/terrain";
import { Cover, Prop, Water, Way } from "../worldgen";
import { PLAYER_GLYPH, STAIRS_GLYPH, coverGlyph, propGlyph, groundGlyph, waterGlyph, wayGlyph } from "./glyphs";
import {
  type Contour,
  type HeightMode,
  type Rgb,
  contourBetween,
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

export const CELL_PX = 18;
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

const CLIFF_FACE: Look = { background: [72, 64, 60], glyph: "", color: [0, 0, 0] };
const FACE_MIN_CLIFF_SIDES = 3;

const isCliffFace = (terrain: Terrain, x: number, y: number, tile: Tile): boolean =>
  NEIGHBOURS.filter((o) => isCliff(tile, terrain(x + o.x, y + o.y))).length >= FACE_MIN_CLIFF_SIDES;

const hasStairs = (terrain: Terrain, x: number, y: number, tile: Tile): boolean =>
  isTrail(tile) && NEIGHBOURS.some((o) => isStairs(tile, terrain(x + o.x, y + o.y)));

const isPathShown = (x: number, y: number) => unit(hash(PATH_SALT, x, y)) < PATH_VISIBILITY;

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

const lookOf = (tile: Tile, mode: HeightMode, light: number, x: number, y: number): Look => {
  const surface = tile.way === Way.Road ? wayColor[Way.Road] : groundColor[tile.ground];
  const surfaceBackground = () => surfaceColor(mode, surface, tile.height, light);
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

export const drawViewport = (
  ctx: CanvasRenderingContext2D,
  terrain: Terrain,
  center: Point,
  mode: HeightMode,
): void => {
  const columns = Math.ceil(ctx.canvas.clientWidth / CELL_PX) | 1;
  const rows = Math.ceil(ctx.canvas.clientHeight / CELL_PX) | 1;
  const left = center.x - (columns >> 1);
  const top = center.y - (rows >> 1);
  const originX = Math.floor((ctx.canvas.clientWidth - columns * CELL_PX) / 2);
  const originY = Math.floor((ctx.canvas.clientHeight - rows * CELL_PX) / 2);
  const screen = (x: number, y: number) => ({
    px: originX + (x - left) * CELL_PX,
    py: originY + (y - top) * CELL_PX,
  });

  ctx.font = `${CELL_PX - 3}px "DejaVu Sans Mono", Menlo, Consolas, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const isInside = terrain(center.x, center.y).cover !== Cover.None;
  const isHidden = (tile: Tile) => !isInside && tile.cover !== Cover.None;
  const lightAt = createLighting(terrain, left, top, columns, rows);
  const lookAt = (tile: Tile, x: number, y: number): Look => {
    if (tile.cover !== Cover.None && !isInside) return coverLook(tile.cover, lightAt(x, y), x, y);
    const look = isCliffFace(terrain, x, y, tile) ? CLIFF_FACE : lookOf(tile, mode, lightAt(x, y), x, y);
    return tile.cover === Cover.None ? look : underCover(look);
  };
  for (let y = top; y < top + rows; y++)
    for (let x = left; x < left + columns; x++) {
      const { px, py } = screen(x, y);
      const tile = terrain(x, y);
      const look = lookAt(tile, x, y);
      ctx.fillStyle = css(look.background);
      ctx.fillRect(px, py, CELL_PX, CELL_PX);
      const isPlayer = x === center.x && y === center.y;
      const stairs = !isHidden(tile) && hasStairs(terrain, x, y, tile);
      const glyph = isPlayer ? PLAYER_GLYPH : stairs ? STAIRS_GLYPH : look.glyph;
      ctx.fillStyle = css(isPlayer ? PLAYER_COLOR : look.color);
      ctx.fillText(glyph, px + CELL_PX / 2, py + CELL_PX / 2 + 1);
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
          ctx.moveTo(px, py - CELL_PX);
          ctx.lineTo(px, py);
        }
        if (contourAt(tile, terrain(x, y + 1)) === contour) {
          ctx.moveTo(px - CELL_PX, py);
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
        ctx.moveTo(px, py - CELL_PX);
        ctx.lineTo(px, py);
      }
      if (edgeShown(x, y + 1)) {
        ctx.moveTo(px - CELL_PX, py);
        ctx.lineTo(px, py);
      }
    }
  ctx.stroke();
};
