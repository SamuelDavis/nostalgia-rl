# World generation

`createWorldgen(seed)` (`src/worldgen/world.ts`) builds a world description. `generateChunk(world, cx, cy)` (`src/worldgen/chunk.ts`) turns it into tiles. The same seed and coordinates always give the same output, regardless of which chunks were generated before.

## Units

The constants live in `src/worldgen/constants.ts`.

- **Tile:** one grid cell, with integer coordinates. The world is unbounded in every direction.
- **Chunk:** `CHUNK_SIZE`² tiles; the unit of generation and caching. A chunk is a set of flat typed arrays indexed by `tileIndex(lx, ly)`: `height`, `ground`, `water`, `feature`, and `biome`. The value sets are in `src/worldgen/terrain.ts`.
- **Macro cell:** `MACRO_SIZE`² tiles; the unit for placing large features such as river sources and camps.
- **Height:** integer levels from 0 to `HEIGHT_LEVELS - 1`, fine enough that natural slope can exceed `MAX_CLIMB`, the most a walker can climb or descend per step; steeper steps are cliffs. Tiles below `SEA_LEVEL` are ocean, and the ocean surface sits at `SEA_LEVEL - 1`. Express thresholds as elevations (0–1) converted with `heightLevel`, so they survive changes to `HEIGHT_LEVELS`.

## Pipeline

Each stage depends only on coarser stages within a bounded neighbourhood. That is what lets any chunk be generated in isolation.

1. **Fields** (`fields.ts`): continuous noise fields for `elevation`, `temperature`, and `moisture`, plus `drainage`, a smoothed elevation that rivers follow. Elevation combines a continent layer, ridged mountain ranges, and small hills. Land is biased to appear near the origin.
2. **Biomes** (`biome.ts`): a Whittaker-style classification by elevation, temperature, and moisture: ocean, beach, grassland, forest, desert, or mountain.
3. **Rivers** (`rivers.ts`): a macro cell may hold a river source on high ground. From there the river follows the drainage gradient downhill, meandering, until it reaches the sea or ends in a lake at a local minimum. Its water level never rises, descends no faster than half `MAX_CLIMB` per tile (headroom for rounding), and it widens downstream.
4. **Camps** (`world.ts`): settlement sites on flat, dry, non-mountain land, away from rivers. The world spawn is the nearest valid site to the origin. Macro cells around the spawn always get camps.
5. **Roads** (`world.ts`): least-cost paths (A\* on a coarse grid that penalises slope and avoids the sea) between camps in neighbouring cells. Roads touching the spawn always exist.
6. **Chunk** (`chunk.ts`), per tile:
   - classify the biome;
   - flood the ocean;
   - carve rivers and lakes, with beds interpolated between nodes and banks that rise `MAX_CLIMB` per tile;
   - pave roads, placing bridges over water;
   - flatten camp yards, settle their surroundings within `MAX_CLIMB` per tile, and place tents and a campfire;
   - grow vegetation from biome density plus a grove noise layer (forests with clearings, groves in grassland);
   - add decorations.
     Snow appears in cold areas, with a noise-dithered edge.

Results for a macro cell (traced rivers, camps, roads) are memoized in an LRU cache inside the world object. The first chunk in a new region pays for tracing nearby rivers. On the author's machine that took about 380 ms for the very first chunk, and a warm chunk takes about 4 ms (`npm run bench`).

## Determinism

Peers will generate terrain independently, so results must be bit-identical across JavaScript engines.

- All randomness is counter-based hashing (`src/lib/hash.ts`): `hash(seed, salt, x, y, …)`. There is no stateful random number generator and no `Math.random`.
- Use only operations with exactly specified results: `+ - * /`, `Math.sqrt`, `Math.floor`, `ceil`, `round`, `abs`, `min`, `max`, and integer operations. `Math.sin`, `cos`, `exp`, `pow`, `atan2`, `hypot`, and `**` are implementation-approximated, so keep them out of anything peers must reproduce.
- `simplex-noise` uses only exact operations, and it is seeded through the hash.

## Tests

- `*.test.ts` files sit next to their sources. They check:
  - **determinism:** generation order and world instance don't affect results;
  - **golden digests** of three chunks (`chunk.test.ts`): update them deliberately, with `-u`, whenever generation is meant to change;
  - **invariants across seeds:** rivers never flow uphill and end in sea or lake, roads cross land, the spawn is dry and near the origin, and carving (rivers, camps) never makes a step steeper than `max(MAX_CLIMB, natural step)`.
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
