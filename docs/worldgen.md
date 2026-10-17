# World generation

`createWorldgen(seed)` (`src/worldgen/world.ts`) builds a world description. `generateChunk(world, cx, cy)` (`src/worldgen/chunk.ts`) turns it into tiles. The same seed and coordinates always give the same output, regardless of which chunks were generated before.

## Units

The constants live in `src/worldgen/constants.ts`.

- **Tile:** one grid cell, with integer coordinates. The world is unbounded in every direction.
- **Chunk:** `CHUNK_SIZE`² tiles; the unit of generation and caching. A chunk is a set of flat typed arrays indexed by `tileIndex(lx, ly)`: `height`, `ground`, `water`, `feature`, `biome`, and `way` (road or path over the natural ground). The value sets are in `src/worldgen/terrain.ts`.
- **Macro cell:** `MACRO_SIZE`² tiles; the unit for placing large features such as river sources and camps.
- **Height:** integer levels from 0 to `HEIGHT_LEVELS - 1`, fine enough that natural slope can exceed `MAX_CLIMB`, the most a walker can climb or descend per step; steeper steps are cliffs. Tiles below `SEA_LEVEL` are ocean, and the ocean surface sits at `SEA_LEVEL - 1`. Express thresholds as elevations (0–1) converted with `heightLevel`, so they survive changes to `HEIGHT_LEVELS`.

## Pipeline

Each stage depends only on coarser stages within a bounded neighbourhood. That is what lets any chunk be generated in isolation.

1. **Fields** (`fields.ts`, `landform.ts`): continuous noise fields. Elevation follows Minecraft's 1.18 model ([research](research/zones-and-terrain.md#1-minecraft-overworld-terrain-118)). Three 2D noises (continentalness, erosion, and peaks-and-valleys from a ridge noise) go through nested cubic splines (`src/lib/spline.ts`) into a height offset, where one unit is 128 levels and 0 is sea level. Low erosion gives mountains, plateaus and cliffs; high erosion gives plains. Rugged ground gets jagged peaks and is floored into ledges, each a single-tile cliff. One deliberate deviation: peaks follow the ridge noise's zero crossings, giving long ranges, where Minecraft's fold forms rings. Land is biased to appear near the origin. `drainage` is the offset without detail, and rivers follow it. `climate` samples elevation, temperature and moisture together.
2. **Biomes** (`biome.ts`): a Whittaker-style classification by elevation, temperature, and moisture: ocean, beach, grassland, forest, desert, or mountain.
3. **Rivers** (`rivers.ts`): a macro cell may hold a river source on high ground. From there the river follows the drainage gradient downhill, meandering, until it reaches the sea or ends in a lake at a local minimum. Its water level never rises, descends no faster than half `MAX_CLIMB` per tile (headroom for rounding), and it widens downstream.
4. **Camps** (`world.ts`, `camp.ts`): settlement sites on flat, dry, non-mountain land, away from rivers, where the settled seam can blend into the surrounding terrain. The world spawn is the nearest valid site to the origin. Macro cells around the spawn always get camps.
5. **Route network** (`world.ts`, `routing.ts`, `trails.ts`): which places connect comes from the relative neighbourhood graph, and how comes from weighted A\* over a cost field with 16 move directions. See [research](research/worldgen-techniques.md).
   - **Roads** link each camp to its relative neighbours within two cells, each pair owned by one side. Cost: slope, with steps steeper than `MAX_CLIMB` heavily penalised, plus wobble noise.
   - **Trails** start at landmarks: a glade (clearing) in each well-forested macro cell and a peak in each mountainous one. Each links to its nearest 1–5 relative neighbours among nearby camps, glades and peaks, with the count biased toward 1. Cost: grade on elevation before ledges (ledges are crossed by stairs, see `src/game/movement.ts`), plus difficulty noise. Tiles already on a road or an earlier trail are discounted, so trails merge instead of crossing.
6. **Chunk** (`chunk.ts`), per tile:
   - classify the biome;
   - flood the ocean;
   - carve rivers and lakes, with beds interpolated between nodes and banks that rise `MAX_CLIMB` per tile;
   - lay roads and trails into the `way` layer, placing bridges over water;
   - flatten camp yards, settle their surroundings within `MAX_CLIMB` per tile, and place tents (never on a way) and a campfire;
   - grow vegetation from biome density plus a grove noise layer (forests with clearings, groves in grassland), leaving glades clear;
   - add decorations.
     Snow appears in cold areas, with a noise-dithered edge.

Results for a macro cell (traced rivers, camps, roads, trails) are memoized in an LRU cache inside the world object. The first chunk in a new region pays for tracing nearby rivers. On the author's machine that took about 380 ms for the very first chunk, and a warm chunk takes about 4 ms (`npm run bench`).

## Determinism

Peers will generate terrain independently, so results must be bit-identical across JavaScript engines.

- All randomness is counter-based hashing (`src/lib/hash.ts`): `hash(seed, salt, x, y, …)`. There is no stateful random number generator and no `Math.random`.
- Use only operations with exactly specified results: `+ - * /`, `Math.sqrt`, `Math.floor`, `ceil`, `round`, `abs`, `min`, `max`, and integer operations. `Math.sin`, `cos`, `exp`, `pow`, `atan2`, `hypot`, and `**` are implementation-approximated, so keep them out of anything peers must reproduce.
- `simplex-noise` uses only exact operations, and it is seeded through the hash.

## Tests

- `*.test.ts` files sit next to their sources. They check:
  - **determinism:** generation order and world instance don't affect results;
  - **golden digests** of three chunks (`chunk.test.ts`): update them deliberately, with `-u`, whenever generation is meant to change;
  - **invariants across seeds:** rivers never flow uphill and end in sea or lake, roads cross land, the spawn is dry and near the origin, and carving (rivers, camps) never makes a step steeper than `max(MAX_CLIMB, natural step)`; trails are walkable up to their far end under the game's movement rules (`src/game/trails.test.ts`).
- `chunk.bench.ts` asserts a time budget for a warm chunk.

## Looking at the world

`npm run map` writes a PNG to `artifacts/` (gitignored):

- `--seed N`: the world seed.
- `--x X --y Y`: the centre, in tiles.
- `--size PX`: the image size in pixels.
- `--scale S`: tiles per pixel. The default biome layer samples the fields directly and overlays rivers, roads, and camps; it's good for overviews at scale 4–32.
- `--layer tiles`: renders real chunk output (ground, water, features), and needs `--scale 1`.
- `--height shade|tint`: height rendering, as in the game's height modes (`src/view/palette.ts`).

All tuning constants sit at the top of each source file.
