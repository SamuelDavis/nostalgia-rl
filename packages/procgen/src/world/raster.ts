import { type Vec2, type Vec3 } from "../core/geometry";
import { hash } from "../core/hash";

export type Column =
  | Uint8ArrayConstructor
  | Int8ArrayConstructor
  | Uint16ArrayConstructor
  | Int16ArrayConstructor
  | Uint32ArrayConstructor
  | Int32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

export type Schema = { readonly [name: string]: Column };
export type Columns<S extends Schema> = { readonly [K in keyof S]: InstanceType<S[K]> };
export type Draft<S extends Schema> = { -readonly [K in keyof S]: number };

export interface Raster<S extends Schema> {
  readonly origin: Vec3;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly columns: Columns<S>;
}

export interface RasterShape {
  readonly origin: Vec2 | Vec3;
  readonly width: number;
  readonly height: number;
  readonly depth?: number;
}

export const createRaster = <S extends Schema>(
  schema: S,
  { origin, width, height, depth = 1 }: RasterShape,
): Raster<S> => ({
  origin: { z: 0, ...origin },
  width,
  height,
  depth,
  columns: Object.fromEntries(
    Object.entries(schema).map(([name, column]) => [name, new column(width * height * depth)]),
  ) as unknown as Columns<S>,
});

export const indexOf = ({ origin, width, height }: Raster<Schema>, x: number, y: number, z = origin.z): number =>
  ((z - origin.z) * height + (y - origin.y)) * width + (x - origin.x);

export const forEachTile = <S extends Schema>(
  raster: Raster<S>,
  visit: (draft: Draft<S>, x: number, y: number, z: number) => void,
): void => {
  const { origin, width, height, depth, columns } = raster;
  const names = Object.keys(columns) as (keyof S & string)[];
  const draft = {} as Draft<S>;
  let i = 0;
  for (let z = origin.z; z < origin.z + depth; z++)
    for (let y = origin.y; y < origin.y + height; y++)
      for (let x = origin.x; x < origin.x + width; x++, i++) {
        for (const name of names) draft[name] = columns[name][i]!;
        visit(draft, x, y, z);
        for (const name of names) columns[name][i] = draft[name];
      }
};

export const transferablesOf = (raster: Raster<Schema>): ArrayBuffer[] =>
  Object.values(raster.columns).map((column) => column.buffer as ArrayBuffer);

export const digest = (raster: Raster<Schema>): number => {
  let h = hash(raster.origin.x, raster.origin.y, raster.origin.z, raster.width, raster.height, raster.depth);
  for (const name of Object.keys(raster.columns).sort()) for (const value of raster.columns[name]!) h = hash(h, value);
  return h;
};
