# procgen

A library for infinite, deterministic, seeded procedural worlds in TypeScript. A game declares its environmental fields, its zones, where things are sited, and what its features, props and networks look like. The library provides the machinery: hashing, noise, field composition, placement on an infinite plane, a stage graph with bounded reads, feature painting, owned-link networks, typed rasters and worker messaging.

It was designed for peer-to-peer games in which every peer regenerates the world from `(seed, coordinates)` instead of syncing it. Its contracts exist so that two peers, generating chunks in any order on any engine, get identical bytes. The design and its sources are in [procgen-library.md](../../docs/research/procgen-library.md).

The package is self-contained, with no runtime dependencies and no DOM or Node types. Its `tsconfig.json` sets `rootDir` to the package, so an import from outside fails to compile. To reuse it, copy this directory; consumers import its TypeScript source through a bundler such as Vite. Its tests use Vitest.

## Contracts

1. **Everything is a pure function of `(seed, coordinates)`.** Randomness is `Rng`, a counter-based hash with no `next()`. There is no hidden state, so the order of generation can't matter.
2. **Reads are bounded.** A `Stage` declares every stage it reads and the radius it reads them within. The `World` throws on any undeclared or out-of-radius read. `reachOf(stage)` gives a cell's total dependency halo.
3. **Features and links declare their extent.** A feature paints within `reach` of its anchor, and a link's path stays within `spread` of the box spanning its ends. Both are checked, and both feed the radii above.
4. **Each link has one owner,** the end that sorts first by position. Only the owner computes the link, so every cell sees the same one.
5. **Order is total.** Placed features paint in order of priority, then type order, then anchor position. Ties never fall to evaluation order.
6. **Exact arithmetic only.** Use `+ − × ÷`, `Math.sqrt` and integer operations; ECMAScript leaves the rest of `Math` and `**` to each engine. `eslint-determinism.js` bans them; use `sin`, `cos`, `atan` and `atan2` from `core/math` instead. Quantise positions to whole tiles at stage boundaries.

## Modules

| Module                                    | Gives                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`core/hash`](src/core/hash.ts)           | `hash` (any finite numbers, fastest for int32 keys), `hashString`, `rngOf(seed, ...salts)` → `Rng` (`child`, `int`, `chance`, `pick`, `weighted`, `shuffle`) |
| [`core/math`](src/core/math.ts)           | `clamp`, `lerp`, `remap`, `smoothstep`, `floorDiv`, `powInt`, deterministic `sin`, `cos`, `atan`, `atan2`                                                    |
| [`core/geometry`](src/core/geometry.ts)   | `Vec2`/`Vec3`, `Bounds`, distances, segment and polyline projection, relative neighbourhood graph                                                            |
| [`core/noise`](src/core/noise.ts)         | `Field<P>`; seeded `simplex2`, `simplex3` (hashed gradients, no period), `voronoi2` (cell id, site, F1, F2); `fbm`, `ridged`, `warp`                         |
| [`core/fields`](src/core/fields.ts)       | `defineFields`: named fields that read each other, evaluated lazily once per sample; `nearestZone`: classification by the nearest parameter box              |
| [`core/spline`](src/core/spline.ts)       | Nested cubic Hermite splines over any input record                                                                                                           |
| [`core/search`](src/core/search.ts)       | `MinHeap`, `findPath` (A\*)                                                                                                                                  |
| [`core/cache`](src/core/cache.ts)         | LRU `memoize`                                                                                                                                                |
| [`world/grid`](src/world/grid.ts)         | `grid(size)`: cells, cell bounds, rings, cells overlapping bounds                                                                                            |
| [`world/stage`](src/world/stage.ts)       | `stage`, `createWorld`, `reachOf`: cached per-cell computations with declared, enforced reads                                                                |
| [`world/scatter`](src/world/scatter.ts)   | `scatter` (hashed jittered points per cell), `spaced` (minimum spacing by rank), `sprinkle` (per-tile density)                                               |
| [`world/features`](src/world/features.ts) | `FeatureType` (sites → build → bounds → paint), `featuresNear`, `paintFeatures`                                                                              |
| [`world/props`](src/world/props.ts)       | `footprints`: multi-tile props with row-major parts, all-or-nothing `fits`                                                                                   |
| [`world/network`](src/world/network.ts)   | `network`: owned links between sited nodes, `near(grid)`; `routeOnGrid`: bounded least-cost routing                                                          |
| [`world/raster`](src/world/raster.ts)     | `createRaster` over a typed-array schema (2D or layered 3D), `forEachTile` with a typed `Draft`, `digest`, `transferablesOf`                                 |
| [`world/worker`](src/world/worker.ts)     | `serve` and `requester`: request/reply over any `postMessage` port, with zero-copy transfer                                                                  |

## Building a world

[`examples/island.ts`](examples/island.ts) is a complete small world. It has fields and zones, towns spaced across meadows, roads routed between them, towns with multi-tile huts, trees sprinkled by forestness, and a chunk stage that paints rasters. [`examples/island.test.ts`](examples/island.test.ts) shows the properties every world should test: peers agree whatever their generation order, and stitched chunks equal one raster over the same area. To see it: `npx tsx examples/render.ts <seed> <x> <y> <width> <height> <stride>`.

The usual order is:

1. **Fields:** noise composed with `fbm`, `warp` and splines, collected with `defineFields`. Point fields depend only on position. Influence fields, such as lawlessness as distance from towns, read a stage, so compute them inside a stage that declares the read.
2. **Zones:** `nearestZone` over the fields, or a plain function of them.
3. **Sites:** a stage per kind of anchor, using `scatter`, filtered by fields and thinned by `spaced`. A stage reads other sites within a radius when siting depends on them.
4. **Features:** a `FeatureType` per bespoke generator. `build` is bounded and cached per anchor, so sequential or global algorithms belong there: room grids, lock-and-key graphs, WFC, jigsaw. `paint` is pure per tile. Place props with `footprints`.
5. **Networks:** `network` over a node stage, with `routeOnGrid` in `join`. A route's `cost(from, to)` must judge the whole step, because moves can jump tiles.
6. **Chunks:** a stage on the chunk grid that reads `featuresNear` and the network's `near`, and paints a raster with `forEachTile`.
7. **Workers:** build the world in the worker from `(seed, config)`, `serve` chunk requests, and transfer the raster's buffers.

## Notes

- Stage names must be unique within a world; they salt each stage's `Rng`.
- `defineFields` samples expose their fields as getters, so spreading a sample copies nothing; read the fields by name.
- `scatter` returns whole-tile points; cell bounds are inclusive whole tiles.
- `hash` folds the float bits of keys that aren't int32, so fractional and huge coordinates stay distinct.
- Not included yet: presets (a Minecraft-style landform, river drainage), heightfield and voxel helpers beyond a raster's `depth`, and in-footprint generators (WFC, jigsaw). Add them when a game needs them.
