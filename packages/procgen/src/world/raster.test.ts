import { describe, expect, it } from "vitest";
import { createRaster, digest, forEachTile, indexOf, transferablesOf } from "./raster";

const schema = { height: Int16Array, ground: Uint8Array, wetness: Float32Array };

describe("raster", () => {
  it("allocates one typed column per schema entry", () => {
    const raster = createRaster(schema, { origin: { x: 32, y: -32 }, width: 4, height: 3 });
    expect(raster.columns.height).toBeInstanceOf(Int16Array);
    expect(raster.columns.ground).toHaveLength(12);
    expect(raster.origin).toEqual({ x: 32, y: -32, z: 0 });
  });

  it("visits every tile in world coordinates with a draft it writes back", () => {
    const raster = createRaster(schema, { origin: { x: 32, y: -32 }, width: 4, height: 3, depth: 2 });
    forEachTile(raster, (draft, x, y, z) => {
      draft.height = x + y;
      draft.ground = z;
    });
    expect(raster.columns.height[indexOf(raster, 35, -30)]).toBe(5);
    expect(raster.columns.ground[indexOf(raster, 35, -30, 1)]).toBe(1);
  });

  it("digests content, so peers can compare generated chunks", () => {
    const make = (h: number) => {
      const raster = createRaster(schema, { origin: { x: 0, y: 0 }, width: 2, height: 2 });
      raster.columns.height[3] = h;
      return raster;
    };
    expect(digest(make(1))).toBe(digest(make(1)));
    expect(digest(make(1))).not.toBe(digest(make(2)));
  });

  it("lists its buffers for zero-copy transfer", () => {
    const raster = createRaster(schema, { origin: { x: 0, y: 0 }, width: 2, height: 2 });
    expect(transferablesOf(raster)).toHaveLength(3);
  });
});
