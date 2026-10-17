# World generation

`createWorldgen(seed)` (`src/worldgen/world.ts`) builds a world description. `generateChunk(world, cx, cy)` (`src/worldgen/chunk.ts`) turns it into tiles. The same seed and coordinates always give the same output, regardless of which chunks were generated before.

## Units

The constants live in `src/worldgen/constants.ts`.

- **Tile:** one grid cell, with integer coordinates. The world is unbounded in every direction.
- **Chunk:** `CHUNK_SIZE`² tiles; the unit of generation and caching. A chunk is a set of flat typed arrays indexed by `tileIndex(lx, ly)`: `height`, `ground`, `water`, `prop`, `biome`, and `way` (road or path over the natural ground). The value sets are in `src/worldgen/terrain.ts`.
- **Region:** `REGION_SIZE`² tiles (`region.ts`); feature types site their anchors per region (camps at most one, deep forests one per forested blob), and each holds at most one river source.
- **Height:** integer levels from 0 to `HEIGHT_LEVELS - 1`, fine enough that natural slope can exceed `MAX_CLIMB`, the most a walker can climb or descend per step; steeper steps are cliffs. Tiles below `SEA_LEVEL` are ocean, and the ocean surface sits at `SEA_LEVEL - 1`. Express thresholds as elevations (0–1) converted with `heightLevel`, so they survive changes to `HEIGHT_LEVELS`.

## Pipeline

Each stage depends only on coarser stages within a bounded neighbourhood. That is what lets any chunk be generated in isolation.

1. **Fields** (`fields.ts`, `landform.ts`): continuous noise fields. Elevation follows Minecraft's 1.18 model ([research](research/zones-and-terrain.md#1-minecraft-overworld-terrain-118)). Three 2D noises (continentalness, erosion, and peaks-and-valleys from a ridge noise) go through nested cubic splines (`src/lib/spline.ts`) into a height offset, where one unit is 128 levels and 0 is sea level. Low erosion gives mountains, plateaus and cliffs; high erosion gives plains. Rugged ground gets jagged peaks and is floored into ledges, each a single-tile cliff. One deliberate deviation: peaks follow the ridge noise's zero crossings, giving long ranges, where Minecraft's fold forms rings. Land is biased to appear near the origin. `drainage` is the offset without detail, and rivers follow it. Base fields are drawn from noise; derived fields (elevation, mountainness, forestness) are computed from them. `conditions` samples every field a tile needs together. Forestness rises with moisture, with a short-range jitter so forest edges break into patches.
2. **Biomes** (`biome.ts`): a Whittaker-style classification by elevation, temperature, moisture, mountainness and forestness: ocean, beach, grassland, forest, desert, or mountain. A biome is the land's ambient character; its traits (ground, tree density and species, decoration) are one record in `BIOMES`. Places with identity are features, not biomes. Mountain is decided by shape before height: `mountainness` rises with ruggedness (low erosion, inland) once ground is a little above the lowlands, or with altitude alone on high ground, and a low-frequency jitter on its threshold breaks the edge into patches. A height cutoff alone drew contour-shaped edges, so valleys inside a range became grassland tongues.
3. **Rivers** (`rivers.ts`): a region may hold a river source on high ground. From there the river follows the drainage gradient downhill, meandering, until it reaches the sea or ends in a lake at a local minimum. Its water level never rises, descends no faster than half `MAX_CLIMB` per tile (headroom for rounding), and it widens downstream.
4. **Features** (`features/`): see [CONTEXT.md](../CONTEXT.md) for the vocabulary and [ADR 0001](adr/0001-contiguous-world-with-features.md) for the model. A `FeatureType` (`features/feature.ts`) has a priority, a maximum reach from its anchor, the bounds of an anchor's footprint (checked before building), a `build` step run once per anchor (cached), and a `paint` step that rewrites each tile of its footprint over the terrain. Chunks paint the features whose bounds overlap them in priority order; claimed tiles get no vegetation.
   - **Deep forest** (`features/deep-forest.ts`). Siting rule: per region, sample forestness on an 8-tile grid of cells; a cell is deep where forestness ≥ `DEEP_FORESTNESS`. Each connected blob of deep cells (at least `MIN_CELLS`) is one part of a forest, with its glade at the cell with the most deep cells around it. Footprint: deep tiles within the blob's cells or one cell beyond (claimed by the larger blob first), inside the region, less a clearing for any camp; parts never overlap, and parts in neighbouring regions meet at the seam, so one forest can span many regions. Build: every road or trail is walked tile by tile; each run of it under the footprint ends at an opening (open ground beyond), a link (another part beyond) or a stop (the way ends inside, at a camp, peak or trailhead). Each end is joined to the glade by a path routed through the footprint, merging where they meet; if any end of a run can't be routed (a strip cut off from the glade), the way passes through unchanged and uncovered instead. Plus two guaranteed openings, rays from the glade to open ground, and a link to each neighbouring part at a cell pair on the shared edge picked by a hash of both parts, so both sides choose the same one. Paint: replaces terrain ways with its own paths (bridged over water), fills the rest with trees thinning toward the edge from `CORE_DENSITY`, behind a wall: every covered tile beside a tile no forest covers is a tree unless it is a path or water, so paths and rivers are the only ways in; the wall takes precedence over the glade. Cover: a canopy over the footprint, except each opening's mouth, which runs a few nodes along the path so it shows as a notch. The view marks a threshold (`∩`) wherever a way passes from open ground under cover. The view hides covered tiles under canopy unless the player stands on a covered tile. The glade of a region's largest part is its trailhead.
   - **Camp** (`features/camp.ts`). Siting rule: flat, dry, non-mountain land away from rivers, where the settled seam can blend into the surrounding terrain. The world spawn is the nearest valid site to the origin, and regions around the spawn always get camps. Paint: a flat dirt yard at the median level of the ground around it (not its centre tile, which may be a bump or dip), surroundings settled within `MAX_CLIMB` per tile, tents (never on a way) and a campfire.
5. **Route network** (`world.ts`, `routing.ts`, `trails.ts`): which places connect comes from the relative neighbourhood graph, and how comes from weighted A\* over a cost field with 16 move directions. See [research](research/worldgen-techniques.md).
   - Routes stay on dry land: real height is checked at each node and step midpoint, and chunks never lay a way on sea. Bridges are only for rivers and lakes.
   - **Roads** link each camp to its relative neighbours within two cells, each pair owned by one side. Cost: slope, with steps steeper than `MAX_CLIMB` heavily penalised, plus wobble noise.
   - **Trails** start at landmarks: a glade (clearing) in each well-forested region and a peak in each mountainous one. Each links to its nearest 1–5 relative neighbours among nearby camps, glades and peaks, with the count biased toward 1. Cost: grade on elevation before ledges (ledges are crossed by stairs, see `src/game/movement.ts`), plus difficulty noise. Tiles already on a road or an earlier trail are discounted, so trails merge instead of crossing.
6. **Chunk** (`chunk.ts`), per tile:
   - classify the biome;
   - flood the ocean;
   - carve rivers and lakes, with beds interpolated between nodes and banks that rise `MAX_CLIMB` per tile;
   - lay roads and trails into the `way` layer, placing bridges over water;
   - paint features in priority order;
   - grow vegetation from biome density plus a grove noise layer (forests with clearings, groves in grassland), leaving glades clear;
   - add decorations.
     Snow appears in cold areas, with a noise-dithered edge.

Results for a region (traced rivers, anchors, placed features, roads, trails) are memoized in an LRU cache inside the world object. The first chunk in a new region pays for tracing nearby rivers. On the author's machine that took about 380 ms for the very first chunk, and a warm chunk takes about 4 ms (`npm run bench`).

## Determinism

Peers will generate terrain independently, so results must be bit-identical across JavaScript engines.

- All randomness is counter-based hashing (`src/lib/hash.ts`): `hash(seed, salt, x, y, …)`. There is no stateful random number generator and no `Math.random`.
- Use only operations with exactly specified results: `+ - * /`, `Math.sqrt`, `Math.floor`, `ceil`, `round`, `abs`, `min`, `max`, and integer operations. `Math.sin`, `cos`, `exp`, `pow`, `atan2`, `hypot`, and `**` are implementation-approximated, so keep them out of anything peers must reproduce. `npm run lint` enforces this in `src/lib`, `src/worldgen` and `src/game`.
- `simplex-noise` uses only exact operations, and it is seeded through the hash.

## Tests

- `*.test.ts` files sit next to their sources. They check:
  - **determinism:** generation order and world instance don't affect results;
  - **golden digests** of three chunks (`chunk.test.ts`): update them deliberately, with `-u`, whenever generation is meant to change;
  - **invariants across seeds:** rivers never flow uphill and end in sea or lake, roads cross land, the spawn is dry and near the origin, and carving (rivers, camps) never makes a step steeper than `max(MAX_CLIMB, natural step)`; trails are walkable up to their far end under the game's movement rules (`src/game/trails.test.ts`).
- Tests tagged `slow` sweep many seeds or regions; `npm test` skips them; `npm run test:all` and `npm run verify` run them. Tests share one world per seed within a file, since a cold region costs far more than a warm one.
- `chunk.bench.ts` asserts a time budget for a warm chunk.

## Looking at the world

`npm run map` writes a PNG to `artifacts/` (gitignored):

- `--seed N`: the world seed.
- `--x X --y Y`: the centre, in tiles.
- `--size PX`: the image size in pixels.
- `--scale S`: tiles per pixel. The default biome layer samples the fields directly and overlays rivers, roads, trails and features (deep forests tinted, camps and glades marked); it's good for overviews at scale 4–32.
- `--layer tiles`: renders real chunk output (ground, water, props, ways, canopy shaded) with features marked, and needs `--scale 1`.
- `--height shade|tint`: height rendering, as in the game's height modes (`src/view/palette.ts`).

All tuning constants sit at the top of each source file.
