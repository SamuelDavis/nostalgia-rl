# A reusable procgen library

What a portable, isolated, type-safe TypeScript library for infinite, deterministic, seeded worlds should contain. It must serve several games (top-down 2D roguelike, first-person 3D, isometric tactics) whose peers regenerate the world from seed and coordinates instead of syncing it. The sources are primary, and the end compares them with this repo's `src/lib` and `src/worldgen`. Researched 2026-10-18. Items marked **unverified** could not be traced to a primary source. This builds on [worldgen techniques](worldgen-techniques.md) and [zones and terrain](zones-and-terrain.md) and does not repeat them.

## Verdict

- **Randomness is a function, never a stream.** Every random value is `hash(seed, salt, ...coords)`. Stateful generators make output depend on evaluation order: rot.js's global Alea is one case, and so are Minecraft's feature spill-over and Cataclysm's overmap edges. The repo already follows this rule. The library should make it the only API.
- **Float determinism in JS is cheap if transcendentals are banned.** ECMAScript fixes `+ − × ÷` and `Math.sqrt` to IEEE 754 binary64. It leaves `sin`, `exp`, `pow`, `hypot`, `**` and the rest implementation-approximated. The library should ship the lint rule and, where needed, its own polynomial approximations. Fixed point isn't needed.
- **Composition follows Minecraft's 1.18+ data model, as typed code.** Fields are pure functions composed like density functions. Classification picks the nearest box in parameter space, or follows rules. Placement is a pipeline of position modifiers (count → spread → filter → snap). Structures have hashed starts with a hard maximum extent. Code rather than JSON: TypeScript types the graph, and a game supplies tile schemas and feature types.
- **Every stage declares its dependency radius,** and the library enforces it. This is the one rule that makes chunks independent (ADR [0003](../adr/0003-pure-generation-mutation-as-deltas.md)). The repo keeps these radii in scattered constants today.
- **A layered library:** `core` (hash, exact math, noise, fields, splines, point processes, search) → `world` (grids, stage graph, features, networks, rasters, worker host) → optional `presets` (Minecraft-style landform, Whittaker classifier, river and way networks). Games own tile schemas, biome traits, feature types and paint. About half of the repo's `src/lib` and the _patterns_ of `src/worldgen` are reusable now ([§6](#6-this-repo-generic-vs-game-specific)).

## 1. Deterministic randomness

### Stateful RNG makes worlds depend on order

| System                  | What goes wrong                                                                                                                                                                                                                                                                                                 | Source                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Minecraft features      | "Features can place block outside the current chunk's boundaries but are limited in the nearby 3×3 area." They "can spill over into neighboring chunks that have already had their features generated", so two worlds from the same seed and version can "differ slightly" depending on players' travel routes. | [World generation](https://minecraft.wiki/w/World_generation)                                                                            |
| Cataclysm: DDA overmaps | Copies exits from neighbouring overmaps that already exist, and shuffles with the global engine.                                                                                                                                                                                                                | [zones and terrain §2](zones-and-terrain.md#cataclysm-dark-days-ahead-overmaps)                                                          |
| Lazily chunked WFC      | "different evaluation orders give different results".                                                                                                                                                                                                                                                           | [Boris the Brave 2021](https://www.boristhebrave.com/2021/11/08/infinite-modifying-in-blocks/)                                           |
| rot.js                  | One Alea instance with mutable state, exported as `new RNG().setSeed(Date.now())`. Map generators are finite classes with `create(callback)`.                                                                                                                                                                   | [rng.ts](https://github.com/ondras/rot.js/blob/master/src/rng.ts), [map.ts](https://github.com/ondras/rot.js/blob/master/src/map/map.ts) |
| simplex-noise           | Takes a `random` function and draws from it to build its permutation table. Without one it uses `Math.random`, and reusing one Alea instance across `create*` calls changes the output.                                                                                                                         | [README](https://github.com/jwagner/simplex-noise.js)                                                                                    |

### Counter-based alternatives

- **Counter-based PRNGs:** output is a keyed transform of a counter. They "require little or no memory for state". Philox and Threefry pass TestU01 BigCrush and give at least 2^64 independent streams ([Salmon et al. 2011](https://www.thesalmons.org/john/random123/papers/random123sc11.pdf)).
- **Noise-based RNG for games:** Eiserloh argues that noise functions can replace RNGs. He lists "unordered access, better reseeding, record/playback, network loss tolerance, lock-free parallelization" ([GDC 2017 abstract](https://gdcvault.com/play/1024365/Math-for-Game-Programmers-Noise)). The talk itself is gated. Whether it presents Squirrel3 or SquirrelNoise5 is **unverified**; both circulate as ports, e.g. [squirrel-noise-5](https://npmjs.com/package/squirrel-noise-5).
- **The earliest graphics precedent:** Worley hashes a cube's integer coordinates "into a single 32 bit integer which is used as the seed for a fast random number generator". That gives each cube a reproducible point count and positions, and each point an ID: "the hashed cube ID plus the index" ([Worley 1996](https://cedric.cnam.fr/~cubaud/PROCEDURAL/worley.pdf)). This is the hashed jittered grid ([§4](#point-processes-that-work-on-an-infinite-plane)).

| Function                | Width        | Fit in JS                      | Notes                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lowbias32 (repo `hash`) | 32           | `Math.imul`, `>>>`: exact      | Bias 0.1735, "even less biased than the MurmurHash3 finalizer". triple32 reaches 0.0209, near the ideal 0.021 ([Wellons](https://nullprogram.com/blog/2018/07/31/)). A 2025 update there reports second-order biases in triple32.                                                                          |
| XXH32                   | 32           | Exact                          | All operations are 32-bit, modulo 2^32 ([xxHash spec](https://github.com/Cyan4973/xxHash/blob/dev/doc/xxhash_spec.md)). Suits hashing variable-length keys such as strings.                                                                                                                                |
| SplitMix64              | 64           | Needs BigInt or 2×32 emulation | Vigna recommends it for seeding other generators from a 64-bit seed ([prng.di.unimi.it](https://prng.di.unimi.it/)). Its Variant13 mixer is "very easy to distinguish from random permutations" ([Evensen 2018](https://mostlymangling.blogspot.com/2018/07/on-mixing-functions-in-fast-splittable.html)). |
| PCG                     | 64/128 state | BigInt                         | Stateful, with "jump ahead" and multiple streams ([pcg-random.org](https://www.pcg-random.org/)). Jumping still needs an index, so a pure hash is simpler.                                                                                                                                                 |

**Recommendation.** Keep a 32-bit integer hash built on `Math.imul` as the only primitive: lowbias32 now, swappable behind the interface for triple32 or a 2-round variant if tests show bias. Derive child keys hierarchically, as `seed → stage salt (hashString once) → cell → index`. A per-entity stream (`rng.child(id)`) is fine _inside_ one bounded `build` step, because its order is local and fixed. Expose no `next()` at library level.

**Repo caveat.** `hash` applies `key | 0` (`src/lib/hash.ts`), so non-integer keys truncate and coordinates wrap beyond ±2^31. simplex-noise does the same: `fastFloor = Math.floor(x) | 0` (`node_modules/simplex-noise/dist/esm/simplex-noise.js`), and its README says "coordinates above 2^31 may no longer produce noisy output". The library should type keys as int32 and document the coordinate range.

## 2. Float determinism across engines

- **Exact:** `Number::multiply` (like add, subtract and divide) "performs multiplication according to the rules of IEEE 754-2019 binary double-precision arithmetic". `Math.sqrt` returns 𝔽(the square root of ℝ(n)), which is correctly rounded. `Math.fround` converts "to IEEE 754-2019 binary32 format using roundTiesToEven". All three are from [ECMA-262](https://tc39.es/ecma262/#sec-function-properties-of-the-math-object). Integer ops (`Math.imul`, bitwise, `>>>`) are exact.
- **Approximated:** "acos, acosh, asin, asinh, atan, atanh, atan2, cbrt, cos, cosh, exp, expm1, hypot, log, log1p, log2, log10, pow, random, sin, sinh, tan, and tanh" are "not precisely specified … some latitude is allowed in the choice of approximation algorithms" ([ECMA-262 §21.3.2](https://tc39.es/ecma262/#sec-function-properties-of-the-math-object)). `Number::exponentiate` (`**`) "returns an implementation-approximated value".
- **In practice:** V8 implements sin and cos with an fdlibm port ([Chromium review 411263004](https://codereview.chromium.org/411263004)), and Gecko imported fdlibm/msun ([gecko-dev commit](https://source-hub.etos-pro.ru/mozilla/gecko-dev/commit/5887beb7b834d0e66e1daa7cc5ef056939ef13c3)). Agreement between them is an accident, not a guarantee. What JavaScriptCore uses is **unverified**.
- **Other traps:** `Array.prototype.sort` has been stable since ES2019, but "the sort order is implementation-defined if sortCompare is not a consistent comparator" ([ECMA-262](https://tc39.es/ecma262/#sec-sortindexedproperties)). Comparators must therefore be total, with ties broken by hash or coordinates.
- **WebAssembly**, if the core is ever compiled for speed: arithmetic is deterministic except NaN bit patterns ([nondeterminism](https://www.webassembly.org/docs/nondeterminism/)). Relaxed SIMD "gave up determinism across different architectures" ([Wasmtime](https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html)).
- **Fixed point** buys nothing in JS for `+ − × ÷` and costs readability. It matters only when porting to an engine whose float semantics differ (x87, fast-math C#/C++ builds), or for transcendentals. For those, write polynomial or table approximations from exact ops; they are then deterministic by construction. **Quantise at stage boundaries** (anchors to integer tiles, heights to integer levels), as the repo does. A port to another language then reproduces discrete outputs even if it only matches intermediate floats.
- **Enforce:** the repo's `eslint.config.js` bans the approximated `Math` members and `**` in generation code. Ship it as the library's lint preset. Use golden digests of chunks (repo `chunk.test.ts`) as conformance vectors for ports.

## 3. Environmental fields

### How shipped games compose fields

| Source          | Fields                                                                                             | Composition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Classification                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minecraft 1.18+ | Router: temperature, vegetation, continents, erosion, depth, ridges; terrain from `final_density`. | Density functions form a DAG of typed nodes (`noise`, `add`, `mul`, `clamp`, `spline`, `range_choice`, `shift_*`). Nodes are referenced by ID or inlined, with caching markers: `cache` computes "only … once per block position", and `interpolated` interpolates within cells. `flat_cache`/`cache_2d` were removed in 26.3 ([Density function](https://minecraft.wiki/w/Density_function)). The biome fields "do not affect terrain shape" except through `final_density`, which reuses them ([Noise router](https://minecraft.wiki/w/Noise_router)). | 6D nearest box: "the game uses the closest biome interval in the 6D space" ([World generation](https://minecraft.wiki/w/World_generation)). Blocks come from surface rules, a decision tree of `sequence`/`condition`/`block` ([Surface rule](https://minecraft.wiki/w/Surface_rule)). |
| Dwarf Fortress  | Elevation, rainfall, temperature, drainage, volcanism, savagery; good/evil as tile counts.         | Global fields over a mesh, with weighted random ranges ([Advanced world generation](https://dwarffortresswiki.org/index.php/Advanced_world_generation)). Erosion and history are global, iterative simulations.                                                                                                                                                                                                                                                                                                                                          | Elevation first (0–99 ocean, 300–400 mountain), then drainage × rainfall, then temperature variants (tundra, taiga, tropical). Savagery and alignment are a separate "surroundings" axis per region ([Biome](https://dwarffortresswiki.org/index.php/Biome)).                          |
| Red Blob        | Elevation, moisture.                                                                               | Noise, redistribution, island shaping. "The calculation of the biome at position (x,y) is independent of calculations at any other position", which is both what makes it infinite-friendly and its weakness: regions don't relate ([terrain from noise](https://www.redblobgames.com/maps/terrain-from-noise/)).                                                                                                                                                                                                                                        | Elevation × moisture table.                                                                                                                                                                                                                                                            |
| Inigo Quilez    | Any.                                                                                               | Domain warping: f(p + h(p)), e.g. `fbm(p + fbm(p + fbm(p)))` ([warp](https://iquilezles.org/articles/warp/)). Minecraft's `shift_x`/`shift_z` are the same idea.                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                                      |
| No Man's Sky    | Not public beyond abstracts.                                                                       | McKendrick's talk covers "techniques used to generate planets and the supporting structures allowing this to happen continuously in real-time", from generation through population and simulation ([GDC 2017](https://gdcvault.com/play/1024265/Continuous-World-Generation-in-No)). Murray covers terrain "using math" ([GDC 2017](https://gdcvault.com/play/1024514/Building-Worlds-Using)). Content is **unverified** (gated).                                                                                                                        | —                                                                                                                                                                                                                                                                                      |
| Houdini         | Named layers: `height`, `mask`, and others.                                                        | A 2D volume flows through a node chain, and most nodes take a mask input. HeightField Tile Split/Splice distribute work by tiles ([Heightfields](https://www.sidefx.com/docs/houdini/model/heightfields.html)).                                                                                                                                                                                                                                                                                                                                          | Masks feed scatter.                                                                                                                                                                                                                                                                    |

### Game-specific fields

Fields fall into two kinds, and the library should type them differently:

1. **Point fields:** pure functions of position, e.g. forestness and volcanicness (DF volcanism), toxicity and magicness when drawn from noise. Their cost is O(1) per sample, they need no halo, and they can be warped.
2. **Influence fields:** they read anchors near a point, e.g. development (this repo's wayness, raised near camps) and lawlessness (distance from settlements; compare Cataclysm specials' `city_distance`, [OVERMAP.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/OVERMAP.md)). Each one's radius adds to the dependency halo of every stage that reads it. The repo's `createWayness` reads camps in `regionsAround(…, 1)` (`src/worldgen/ways.ts`).

DF's "surroundings" (savagery × alignment, constant per named region) suggests a third kind: **zone-constant fields**, assigned per region or cell rather than per point. They are cheap and make borders sharp.

Domain warping a point field adds no halo. Warping an influence field adds the warp amplitude to its radius.

## 4. Placing features and props

### Point processes that work on an infinite plane

| Method                                                                                     | Order-independent?                                                                                                                                       | Quality                                                                  | Source                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-tile hash below a density                                                              | Yes                                                                                                                                                      | White noise: clumps                                                      | Repo vegetation (`src/worldgen/chunk.ts`)                                                                                                                                                                                                                       |
| Hashed jittered grid: ≤1 (or Poisson-many) points per cell, positions hashed from the cell | Yes; query the cell and neighbours                                                                                                                       | Stratified; a minimum gap if jitter keeps a margin                       | [Worley 1996](https://cedric.cnam.fr/~cubaud/PROCEDURAL/worley.pdf); Minecraft `random_spread` is one attempt per `spacing`² region, offset in [0, spacing − separation) ([Structure set](https://minecraft.wiki/w/Structure_set)); repo river and way lattices |
| Bridson dart throwing                                                                      | **No**: a sequential active list, "Generate up to k points … in the spherical annulus between radius r and 2r"                                           | Blue noise, O(N)                                                         | [Bridson 2007](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf)                                                                                                                                                                         |
| Recursive Wang tiles                                                                       | Yes: "deterministic and tile-based; thus, any local portion of a potentially infinite point set may be consistently regenerated", with arbitrary density | Blue noise; needs a precomputed tile set                                 | [Kopf et al. 2006](https://johanneskopf.de/publications/blue_noise)                                                                                                                                                                                             |
| Local maxima of noise within R                                                             | Yes                                                                                                                                                      | Blue-ish; Patel recommends Poisson or jittered grids as "more efficient" | [Red Blob](https://www.redblobgames.com/maps/terrain-from-noise/)                                                                                                                                                                                               |
| Spacing by rank                                                                            | Yes, if the rivals are within a bounded radius                                                                                                           | Hard-core spacing                                                        | Repo caves: a candidate is dropped if a higher one lies within `CAVE_SPACING` (`src/worldgen/caves/siting.ts`); Minecraft `exclusion_zone` against another set, 1–16 chunks ([Structure set](https://minecraft.wiki/w/Structure_set))                           |

**Global uniqueness** has no local form. Cataclysm's `GLOBALLY_UNIQUE` ([OVERMAP.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/OVERMAP.md)) has to be replaced in an infinite world by a closed-form layout, like Minecraft's `concentric_rings` for strongholds ([Structure set](https://minecraft.wiki/w/Structure_set)), or by the repo's spawn search near the origin.

### Minecraft's composable placement

- A **placed feature** is `feature` + `placement`, "a list of placement modifiers, applied in order", each taking the previous step's positions. Modifiers are filters (`biome`, `rarity_filter`, `block_predicate_filter`, `surface_water_depth_filter`), multipliers (`count`, `noise_based_count`, `count_on_every_layer`) and movers (`in_square`, `offset`, `heightmap`, `environment_scan`) ([Placed feature](https://minecraft.wiki/w/Placed_feature)). Vanilla `trees_plains` is `count` (weighted 0:19 / 1:1) → `in_square` → `surface_water_depth_filter` → `heightmap OCEAN_FLOOR` → `block_predicate_filter would_survive` → `biome` ([trees_plains.json](https://github.com/misode/mcmeta/blob/data/data/minecraft/worldgen/placed_feature/trees_plains.json), mcmeta 26.4-snapshot-4).
- A **configured feature** is a hard-coded type plus config. Selectors (`random_selector`, `simple_random_selector`, `random_boolean_selector`) nest placed features ([Configured feature](https://minecraft.wiki/w/Configured_feature)). A biome lists placed features per decoration step: `plains.json` has 11 lists ([plains.json](https://github.com/misode/mcmeta/blob/data/data/minecraft/worldgen/biome/plains.json)). The steps run from `raw_generation` to `top_layer_modification`, and "for each decoration step, first the matching structure pieces are placed, followed by the features" ([World generation](https://minecraft.wiki/w/World_generation)).
- **Structures:** a weighted list per set, placement by `random_spread`/`concentric_rings` ([Structure set](https://minecraft.wiki/w/Structure_set)). Jigsaw grows from `start_pool` to depth `size` ≤ 20, within `max_distance_from_center`. A piece must not intersect earlier pieces, and fallback pools terminate open connectors ([Jigsaw structure](https://minecraft.wiki/w/Jigsaw_structure)). `terrain_adaptation` (`beard_thin`, `beard_box`, `bury`, `encapsulate`) reshapes terrain around pieces ([Structure/JSON format](https://minecraft.wiki/w/Structure/JSON_format)). Starts are computed in the owning chunk, and nearby chunks store references ([World generation](https://minecraft.wiki/w/World_generation)).

**Fit.** The modifier pipeline is the right shape for props and small features: a typed `Iterable<Position>` transform. Its source must be a cell's hashed seed, not a chunk-sequential RNG. Structures map to the repo's `FeatureType` (`bounds`, `build`, `paint`). The library should drop the decoration-step spill-over model and keep paint pure per tile.

### Bespoke generators inside a bounded footprint

These need global or sequential search, so they belong in a feature's `build`, run once per anchor and cached, never across chunks:

- **Spelunky:** a 4×4 room grid. A start room in the top row, a random walk left, right or down that places rooms with guaranteed exits (types 1–3), an exit in the bottom row, and unexitted filler rooms. That gives a guaranteed solution path and then templates per room ([Kazemi's annotated Spelunky](https://tinysubversions.com/spelunkyGen/), a modded copy of the game; Derek Yu's own write-up not consulted).
- **Don't Starve:** tasks hold graphs of room nodes; tasks join where keys satisfy locks; set pieces are assigned to rooms, and assignment may fail; rooms become a Voronoi map, then tiles, then entities, then roads ([wiki](https://dontstarve.wiki.gg/wiki/World_Generation); the script files are **unverified**). This is a whole finite world. The useful pattern is a lock/key graph embedded into a footprint.
- **Cataclysm mutable specials** join pieces per edge, like jigsaw ([zones and terrain §2](zones-and-terrain.md#cataclysm-dark-days-ahead-overmaps)).
- **Caves of Qud:** zone builders applied in succession with priorities ([zones and terrain §2](zones-and-terrain.md#caves-of-qud-zones)). Bucklew's pipeline "applies WFC in multiple passes" ([WFC README](https://github.com/mxgmn/WaveFunctionCollapse)).
- **WFC / Townscaper:** WFC can hit contradictions, and the problem is NP-hard, though contradictions are rare in practice. Stålberg "combined WFC with marching cubes on irregular grids" ([WFC README](https://github.com/mxgmn/WaveFunctionCollapse)). Infinite WFC can be made order-independent by modifying in blocks, at about 4× the work, and patterns larger than a block are impossible ([Boris the Brave](https://www.boristhebrave.com/2021/11/08/infinite-modifying-in-blocks/)). Use it inside a footprint, with a hashed retry index on contradiction.

### Networks: rivers, roads, paths, bridges

These are already researched: lattice networks with owned links ([ADR 0004](../adr/0004-ways-and-rivers-on-a-node-lattice.md)), least-cost routing and proximity graphs ([worldgen techniques](worldgen-techniques.md)), and edge-hashed ports ([zones and terrain §2](zones-and-terrain.md#edge-matched-region-generation)). Cataclysm's `overmap_connection` gives each subtype a `basic_cost` and `locations`, so a road over a river becomes a bridge subtype ([OVERMAP.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/OVERMAP.md)). That is a data-driven version of the repo's "way over water → bridge prop" in `chunk.ts`. The generic parts are the node lattice, the reach, a single owner per link, a bounded-box router, and segment rasterisation with a width. Cost terms and kinds belong to the game.

### Overlap and priority

- Minecraft orders work by decoration step (structures before features). Within a step, order is chunk-sequential and so order-dependent (above).
- The repo sorts features near a region by `priority` and paints them in order. A feature claims a tile by returning `true`, and claimed tiles get no vegetation (`src/worldgen/features/feature.ts`, `chunk.ts`). Props are placed whole or not at all ([ADR 0006](../adr/0006-props-are-objects-with-footprints.md)). Siting rules read higher-priority anchors, never painted output ([ADR 0001](../adr/0001-contiguous-world-with-features.md)).
- **Library rule:** a total order of `(priority, anchor hash, anchor x, y)`, and paint as a pure fold over that list per tile. A feature that must avoid another reads the other's _layout_ through the stage graph, within its radius. That is how camps keep tents off ways (`tentsOf` in `features/camp.ts`).

## 5. Chunks, scales, caching, workers, dimension

### Bounded dependency

The chunk at C depends on stage S within radius r_S. The halo is the sum of radii down the chain. Minecraft bounds features to 3×3 chunks and jigsaw to `max_distance_from_center` ≤ 128 ([zones and terrain §2](zones-and-terrain.md#minecraft-structures-and-jigsaw)). The repo's radii are implicit: `NEAR_CELLS` in `ways.ts` and `rivers.ts`, `reach = 8` in `chunk.ts`, `regionsAround(…, 1)` in several sitings, `Math.ceil(reach / REGION_SIZE)` in `world.ts`. A type can't check these, but a stage graph can: each stage declares `radius` and receives a reader clipped to it, so an out-of-radius read throws in development.

### Multi-scale hierarchy

| System         | Scales                                                                        | Source                                                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minecraft      | Block → 4×8 interpolation cell → 16² chunk → `spacing`-chunk structure region | [zones and terrain §1–2](zones-and-terrain.md#1-minecraft-overworld-terrain-118)                                                                                            |
| Dwarf Fortress | World tile → 16×16 embark tiles → 48×48 local tiles                           | [zones and terrain §3](zones-and-terrain.md#3-separate-spaces-behind-entrances)                                                                                             |
| Cataclysm      | Tile → 12² submap → 2×2 OMT → 180² overmap; specials per sector               | [zones and terrain §2](zones-and-terrain.md#cataclysm-dark-days-ahead-overmaps), [OVERMAP.md](https://github.com/CleverRaven/Cataclysm-DDA/blob/master/doc/JSON/OVERMAP.md) |
| Caves of Qud   | Zone 80×25 → parasang 3×3 zones → world map                                   | [zones and terrain §2](zones-and-terrain.md#caves-of-qud-zones)                                                                                                             |
| This repo      | Tile → 32² chunk → 64/128 lattice cells (rivers/ways) → 256² region           | `src/worldgen/constants.ts`, `rivers.ts`, `ways.ts`                                                                                                                         |

Scales should be values (`Grid` objects with a size), not one global `REGION_SIZE`. Each stage picks its own grid, and the stage graph converts between grids.

### Caching and workers

- Pure stages make caching invisible to results (ADR 0003). Minecraft's `cache` marker is per-position memoisation of a shared subgraph. The repo memoises per cell or region in string-keyed LRUs of fixed capacity (`src/lib/cache.ts`; capacities 4096 to 65536 spread across files). The library should own one cache policy per stage, with keys from integer cell coordinates, and expose cache statistics for benchmarks.
- Workers: functions can't be posted ("Function objects cannot be duplicated by the structured clone algorithm", [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)). The worker must therefore build the generator from a serialisable `(seed, config)`, as `src/chunk-worker.ts` does. Typed arrays are cloned unless their `ArrayBuffer` goes in the transfer list, which moves it "in a fast and efficient zero-copy operation" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)). `chunk-worker.ts` posts without a transfer list, and its world caches are separate from the main thread's, so a region can be computed twice.

### Dimension

- A heightfield is a 2D volume with named height and mask layers ([Houdini](https://www.sidefx.com/docs/houdini/model/heightfields.html)). Minecraft's density is 3D, but all of it except the `factor` × 3D-noise term reduces to a 2D heightmap ([zones and terrain §1](zones-and-terrain.md#1-minecraft-overworld-terrain-118)). The repo uses 2.5D: stacked layers of heightfields linked at tile edges ([ADR 0005](../adr/0005-cave-floors-are-layers-linked-at-tile-edges.md)).
- **Library rule:** fields and placement are dimension-generic over a point type `P` (`Vec2` or `Vec3`). _Rasters_ are pluggable: `Grid2<Schema>` (tiles), `Heightfield<Layers>` (2.5D), `Voxel3<Schema>` (3D density). A top-down roguelike and an isometric tactics game use `Grid2` with a height column. A first-person game samples the same height field at finer resolution, or adds a 3D density on top. Vertical placement (Minecraft's `heightmap`/`environment_scan` modifiers) is a modifier the raster type supplies.

### Node-graph tools

Godot Gaea is a node graph for 2D and 3D, "in early development" ([repo](https://github.com/gaea-godot/gaea)). MapMagic 2 is a node-based infinite generator that makes terrains in play mode ([Asset Store search result](https://assetstore.unity.com/packages/tools/terrain/mapmagic-2-165180); details **unverified**). QuadSpinner Gaea and Houdini are offline and finite or tiled. None of them answers peer determinism. A visual editor could be built later over the library's typed graph. It isn't a reason to make the graph data-first now.

## 6. This repo: generic vs game-specific

| File                                                                                       | Status                             | Notes                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/hash.ts`                                                                          | Generic                            | Counter-based. Fix: int32 key typing (`key \| 0` truncates).                                                                                                                                                                                                            |
| `src/lib/noise.ts`                                                                         | Generic                            | `Field2`, `fbm`, `exactPower`. Seeds simplex-noise through the hash.                                                                                                                                                                                                    |
| `src/lib/spline.ts`                                                                        | Generic                            | Nested Hermite splines over any input type `I`: Minecraft's `spline` density function.                                                                                                                                                                                  |
| `src/lib/math.ts`, `geometry.ts` (`relativeNeighbours`), `astar.ts`, `heap.ts`, `cache.ts` | Generic                            |                                                                                                                                                                                                                                                                         |
| `eslint.config.js`                                                                         | Generic                            | The determinism lint preset.                                                                                                                                                                                                                                            |
| `src/worldgen/region.ts`                                                                   | Nearly generic                     | `Bounds`, `overlaps`, `regionsAround` are generic, but are bound to the `REGION_SIZE` constant; make the grid a value.                                                                                                                                                  |
| `src/worldgen/features/feature.ts`                                                         | Pattern generic                    | `FeatureType`, `place` and `paintInOrder` are the library's feature model. `TileDraft` (Ground, Prop, Water…) and `settle` (`MAX_CLIMB`) belong to the game.                                                                                                            |
| `src/worldgen/routing.ts`                                                                  | Nearly generic                     | Bounded-box A\* on a step grid with a 16-move mask. `climbCost`/`MAX_CLIMB` belong to the game.                                                                                                                                                                         |
| Cell lattice in `rivers.ts` and `ways.ts`                                                  | Generic, duplicated                | `Cell`, `cellKey`, `cellsAround`, and one jittered node per cell are written twice. Extract a `Lattice`.                                                                                                                                                                |
| `src/worldgen/props.ts`                                                                    | Pattern generic                    | `partOf`/`tilesOf` over footprints are generic; the `FOOTPRINTS` table is the game's.                                                                                                                                                                                   |
| `src/worldgen/rivers.ts`                                                                   | Algorithm generic, parameters game | Drainage to the lowest neighbour, basins and spills within a radius, flow counted a bounded depth upstream.                                                                                                                                                             |
| `src/worldgen/ways.ts`                                                                     | Network generic, policy game       | Lattice, reach, picks and `ownedLinks` are generic. Wayness, node kinds and road/path rules are the game's.                                                                                                                                                             |
| `src/worldgen/fields.ts`, `landform.ts`                                                    | Preset                             | The structure (base noise → spline → derived) is generic; the constants form a "Minecraft-like 2D" preset.                                                                                                                                                              |
| `src/worldgen/biome.ts`                                                                    | Pattern generic                    | A rule classifier plus a traits record per biome (`BIOMES`). The rules and traits are the game's.                                                                                                                                                                       |
| `src/worldgen/terrain.ts`, `constants.ts`, `layer.ts`, `landmarks.ts`                      | Game                               | Enums, scale and cave-floor layer identity.                                                                                                                                                                                                                             |
| `src/worldgen/chunk.ts`                                                                    | Game                               | A hard-coded pipeline: biome → ocean → rivers → ways → features → vegetation. The library version is a game-declared sequence of raster passes.                                                                                                                         |
| `src/worldgen/world.ts`                                                                    | Game wiring                        | Hand-wired dependency injection with lazy closure cycles: `camps` and `deepForests` read `ways` before it is declared, and `ways` reads both. A stage graph replaces this; the [staged feature pipeline](../ideas.md#staged-feature-pipeline) idea already asks for it. |
| `features/camp.ts`, `features/deep-forest.ts`, `caves/*`                                   | Game                               | Feature types. Reusable patterns inside: territory as nearest anchor within a radius (`siting.ts`), a link picked from a hash of both parts (`deep-forest.ts`, `junctions.ts`).                                                                                         |
| `src/chunk-worker.ts`                                                                      | Generic shape                      | Transfer the buffers; share or partition caches.                                                                                                                                                                                                                        |

## 7. Recommended architecture

### Packages

```
@procgen/core     zero deps, no game types
  hash, Rng (counter-based), exact math, splines, noise (simplex, value, cellular), Field combinators,
  point processes (lattice, per-tile, rank spacing), search (A*, heap), geometry, LRU, lint preset
@procgen/world    depends on core
  Grid, Stage graph (declared radius, clipped readers), FeatureType + placement modifiers,
  Network (lattice nodes, reach, owned links, router), Classifier, Raster schemas (Grid2, Heightfield, Voxel3),
  chunk pipeline runner, worker host/protocol, digest helpers for golden tests
@procgen/presets  optional; depends on world
  minecraftLandform2D, whittakerRules, riverNetwork, wayNetwork, jitteredStructures
game              depends on any of the above
  tile schema & enums, biome traits, feature types (camp, deep forest, caves, mines), paint, cost terms
```

Develop it in place as `src/procgen/` with an ESLint `no-restricted-imports` boundary forbidding imports from `src/game`, `src/view` and `src/worldgen`. Extract it into packages when a second game consumes it ("extract on second use").

### Core interfaces

```ts
// core
type Int32 = number & { readonly __int32: unique symbol };
interface Rng {
  // pure: same keys → same value; no next()
  child(...keys: readonly number[]): Rng;
  u32(...keys: readonly number[]): number;
  unit(...keys: readonly number[]): number; // [0, 1)
  int(min: number, max: number, ...keys: readonly number[]): number;
  pick<T>(items: readonly T[], ...keys: readonly number[]): T;
}
const rngOf: (seed: number, salt: string) => Rng;

type Field<P, T = number> = (p: P) => T; // P = Vec2 | Vec3; point fields only
const noise: (rng: Rng, opts: FbmOptions) => Field<Vec2>;
const warp: <P>(f: Field<P>, by: Field<P, P>) => Field<P>;
const spline: <I>(s: Spline<I>) => Field<I>; // existing src/lib/spline.ts

interface Grid {
  readonly size: number;
  cellOf(p: Vec2): Cell;
  bounds(c: Cell): Bounds;
  around(c: Cell, ring: number): Cell[];
}
type PointProcess<A> = (cell: Cell) => readonly A[]; // hashed per cell; order-free
const lattice: (grid: Grid, rng: Rng, opts: { margin: number; chance?: Field<Vec2> }) => PointProcess<Vec2>;

// world
interface Stage<Out> {
  readonly name: string;
  readonly grid: Grid;
  readonly radius: number; // tiles this stage reads around its cell
  readonly reads: readonly Stage<unknown>[];
  compute(cell: Cell, read: Reader): Out; // Reader clipped to radius; throws in dev if exceeded
}
interface Reader {
  <T>(stage: Stage<T>, cell: Cell): T;
}

type Placement<C> = (positions: Iterable<Vec2>, ctx: C, rng: Rng) => Iterable<Vec2>; // count/spread/filter/snap
interface FeatureType<A extends Anchor, L, Tile> {
  readonly name: string;
  readonly priority: number;
  readonly maxExtent: number; // hard cap; feeds halo
  sites: Stage<readonly A[]>;
  build(anchor: A, read: Reader): L; // bounded generators (jigsaw, WFC, room grid) live here
  bounds(anchor: A, layout: L): Bounds;
  paint(layout: L, tile: Tile, p: Vec2): boolean; // pure; true = claimed
}

interface Network<N extends Anchor> {
  nodes: Stage<readonly N[]>;
  reach(n: N): number;
  owns(a: N, b: N): boolean; // exactly one side decides each link
  route(a: N, b: N, read: Reader): readonly Vec2[] | undefined;
}

interface Classifier<I, Z> {
  classify(input: I): Z;
} // rules or nearestBox(table)

type Schema = Record<
  string,
  Int8ArrayConstructor | Uint8ArrayConstructor | Int16ArrayConstructor | Float32ArrayConstructor
>;
interface Raster<S extends Schema> {
  readonly origin: Vec2;
  readonly size: number;
  readonly columns: { [K in keyof S]: InstanceType<S[K]> };
}
type Pass<S extends Schema> = (raster: Raster<S>, read: Reader) => void; // game-declared order
interface ChunkGenerator<S extends Schema, K> {
  generate(layer: K, chunk: Cell): Raster<S>;
}
```

**Contracts:**

1. Every output is a pure function of `(seed, config, coordinates)`.
2. A stage reads only declared stages within `radius`.
3. Comparators are total.
4. Each link has one owner.
5. Outputs are quantised to integers at stage boundaries.
6. No approximated `Math`.

### Library vs game

The **library** owns mechanisms: hashing, fields, grids, sampling, stage scheduling and caching, the feature lifecycle (site → build → bounds → paint), networks, the raster runner, workers and the lint preset. The **game** owns meaning: which fields exist and their constants, classification tables and biome traits, tile schema and enums, feature types and their paint, routing cost terms, prop footprints, and the delta layer for mutation (ADR 0003; out of scope for the library except for a `Raster` overlay hook).

### Trade-offs and alternatives considered

| Choice                                      | Alternative                                                                      | Why                                                                                                                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed code combinators                      | Minecraft-style JSON registry (data packs)                                       | Types catch wiring errors and closures are tree-shaken. JSON gives modding and worker-serialisable configs. A serialisable `config` object per preset gets most of the latter. Add a JSON layer only if modding becomes a goal. |
| Counter-based hash only                     | Stateful PRNG with jump-ahead (PCG, xoshiro)                                     | Jumping still needs an index per entity, and a sequential API invites order dependence (Minecraft features, Cataclysm, rot.js).                                                                                                 |
| float64 with exact ops                      | Fixed-point int32                                                                | ECMAScript already makes `+ − × ÷ sqrt` exact. Fixed point matters only for ports to engines without IEEE double guarantees. Quantised outputs and golden digests cover ports.                                                  |
| Bounded stages and lattice networks         | Global passes (DF erosion and history, Priority-Flood, Don't Starve task graphs) | Global passes are unbounded on an infinite plane. They fit inside a feature's bounded `build`, or as a finite "world map" game mode, or as history written to the delta layer.                                                  |
| Jittered lattice and rank spacing           | Bridson, or recursive Wang tiles                                                 | Bridson is sequential. Wang tiles give better blue noise with any density, but need a precomputed tile set; add them as a `PointProcess` if prop spacing looks gridded.                                                         |
| Paint as a pure fold by priority            | Minecraft decoration steps with spill-over                                       | Spill-over is order-dependent.                                                                                                                                                                                                  |
| Dimension-generic fields, pluggable rasters | One 3D voxel model for all games                                                 | Voxels cost memory and need a different renderer (ADR 0005). 2D games would pay for 3D.                                                                                                                                         |
| In-repo `src/procgen` first                 | Separate packages now                                                            | One consumer today. A lint boundary keeps it extractable.                                                                                                                                                                       |

## Not verified from a primary source

- Contents of Eiserloh's GDC 2017 talk (Squirrel3 vs SquirrelNoise5) and of the No Man's Sky GDC 2017 talks; only the abstracts were read.
- What JavaScriptCore uses for `Math.sin` and the rest.
- Don't Starve's script files (`tasks.lua`, `rooms`, `static_layouts`, `locksandkeys.lua`); only the wiki and forum summaries were seen.
- Spelunky room templates and probabilistic tiles (Kazemi's part 1 covers only the room grid).
- MapMagic 2 infinite-tile behaviour, and QuadSpinner Gaea's tiled builds.
- Minecraft's per-chunk feature seeding, and whether multi-noise parameters are quantised to fixed point internally.
- Caves of Qud's zone-edge matching (as before, [zones and terrain](zones-and-terrain.md#not-verified-from-a-primary-source)).
