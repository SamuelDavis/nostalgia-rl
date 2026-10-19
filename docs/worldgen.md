# World generation

`createWorldgen(seed)` (`src/worldgen/world.ts`) builds a world description. `chunkOn(world, layer, cx, cy)` (`src/worldgen/chunk.ts`) turns it into tiles: `generateChunk` for the surface, cave floors otherwise. The same seed and coordinates always give the same output, regardless of which chunks were generated before.

## Units

The constants live in `src/worldgen/constants.ts`.

- **Tile:** one grid cell, with integer coordinates. The world is unbounded in every direction.
- **Layer:** the surface, or one floor of a cave (`layer.ts`, [ADR 0005](adr/0005-cave-floors-are-layers-linked-at-tile-edges.md)). Every position, chunk and terrain lookup is on one layer; `linkAcross` names the layer a step lands on when it crosses a mouth, ramp or junction.
- **Chunk:** `CHUNK_SIZE`² tiles of one layer; the unit of generation and caching. A chunk is a set of flat typed arrays indexed by `tileIndex(lx, ly)`: `height`, `ground`, `water`, `prop`, `biome`, and `way` (road or path over the natural ground). The value sets are in `src/worldgen/terrain.ts`.
- **Region:** `REGION_SIZE`² tiles (`region.ts`); feature types site their anchors per region (camps at most one, deep forests one per forested blob).
- **Height:** integer levels from 0 to `HEIGHT_LEVELS - 1`, fine enough that natural slope can exceed `MAX_CLIMB`, the most a walker can climb or descend per step; steeper steps are cliffs. Tiles below `SEA_LEVEL` are ocean, and the ocean surface sits at `SEA_LEVEL - 1`. Express thresholds as elevations (0–1) converted with `heightLevel`, so they survive changes to `HEIGHT_LEVELS`.

## Pipeline

Each stage depends only on coarser stages within a bounded neighbourhood. That is what lets any chunk be generated in isolation.

1. **Fields** (`fields.ts`, `landform.ts`): continuous noise fields. Elevation follows Minecraft's 1.18 model ([research](research/zones-and-terrain.md#1-minecraft-overworld-terrain-118)). Three 2D noises (continentalness, erosion, and peaks-and-valleys from a ridge noise) go through nested cubic splines (`src/lib/spline.ts`) into a height offset, where one unit is 128 levels and 0 is sea level. Low erosion gives mountains, plateaus and cliffs; high erosion gives plains. Rugged ground gets jagged peaks and is floored into ledges, each a single-tile cliff. One deliberate deviation: peaks follow the ridge noise's zero crossings, giving long ranges, where Minecraft's fold forms rings. Land is biased to appear near the origin. `drainage` is the offset without detail, and rivers follow it. Base fields are drawn from noise; derived fields (elevation, mountainness, forestness) are computed from them. `conditions` samples every field a tile needs together. Forestness rises with moisture, with a short-range jitter so forest edges break into patches.
2. **Biomes** (`biome.ts`): a Whittaker-style classification by elevation, temperature, moisture, mountainness and forestness: ocean, beach, grassland, forest, desert, or mountain. A biome is the land's ambient character; its traits (ground, tree density and species, decoration) are one record in `BIOMES`. Places with identity are features, not biomes. Mountain is decided by shape before height: `mountainness` rises with ruggedness (low erosion, inland) once ground is a little above the lowlands, or with altitude alone on high ground, and a low-frequency jitter on its threshold breaks the edge into patches. A height cutoff alone drew contour-shaped edges, so valleys inside a range became grassland tongues.
3. **Rivers** (`rivers.ts`, [ADR 0004](adr/0004-ways-and-rivers-on-a-node-lattice.md)): a network on a lattice of 64-tile cells, each with one jittered node. A node drains to its lowest neighbour by drainage, unless the ground there is higher; then it is a basin, which holds a lake and spills over its lowest rim to lower ground within a few cells, if the cut is shallow enough. A node carries a river where enough rain (moisture) drains into it from upstream cells, counted a bounded number of steps back, so rivers gather tributaries and widen downstream. Each link is routed along low ground between its two nodes; its water level never rises and descends steadily toward the next node. Camps keep clear of the band each link's channel may occupy, which needs no routing.
4. **Features** (`features/`): see [CONTEXT.md](../CONTEXT.md) for the vocabulary and [ADR 0001](adr/0001-contiguous-world-with-features.md) for the model. A `FeatureType` (`features/feature.ts`) has a priority, a maximum reach from its anchor, the bounds of an anchor's footprint (checked before building), a `build` step run once per anchor (cached), and a `paint` step that rewrites each tile of its footprint over the terrain. Chunks paint the features whose bounds overlap them in priority order; claimed tiles get no vegetation.
   - **Deep forest** (`features/deep-forest.ts`). Grows wherever forestness is deep: each connected blob of deep forest in a region is one part, with its own glade. Parts in neighbouring regions meet at the seam and are joined by a link that both sides pick from a hash of both parts, so one forest can span many regions. It is dense enough that its paths and rivers are the only ways in. Every opening, link and way ending inside connects to the glade within the forest; a way that can't be connected passes through uncovered instead. A canopy covers it, notched at each opening. The glade of a region's largest part is its trailhead. The view hides covered tiles unless the player stands under cover, and marks a threshold (`∩`) where a way passes under it.
   - **Camp** (`features/camp.ts`). Siting rule: flat, dry, non-mountain land away from rivers, where the settled seam can blend into the surrounding terrain. The world spawn is the nearest valid site to the origin, and regions around the spawn always get camps. Paint: a flat dirt yard at the median level of the ground around it (not its centre tile, which may be a bump or dip), surroundings settled within `MAX_CLIMB` per tile, a campfire and three 2×2 tents around it, pitched where no way crosses them ([ADR 0006](adr/0006-props-are-objects-with-footprints.md)).
5. **Way network** (`ways.ts`, `routing.ts`, [ADR 0004](adr/0004-ways-and-rivers-on-a-node-lattice.md)): nodes on a lattice of 128-tile cells, linked only to nodes within their reach.
   - A cell holds a lattice node with probability equal to its wayness: a base per biome (grassland highest, desert lowest) raised near camps. Camps and peaks are nodes too.
   - Each node links to its relative neighbours within its reach (camps reach furthest, so they almost always join), a lattice node to 1–3 of them, biased toward 1; each link is owned by one side. Links are routed by A\* over a short box: slope, steps steeper than `MAX_CLIMB` heavily penalised, wobble noise; routes stay on dry land.
   - A link is a road if it touches a camp or both ends have high wayness, so roads radiate from camps and become paths in emptier country. Paths are graded on elevation before ledges, which they cross by stairs (`src/game/movement.ts`).
   - A lattice node with a single link is a dead end: the way fades out over its last tiles there.
   - Each deep forest's guaranteed openings attach to the nearest node within one cell that isn't a dead end; with none in reach, a short path leads out from the opening and fades.
6. **Chunk** (`chunk.ts`), per tile:
   - classify the biome;
   - flood the ocean;
   - carve rivers and lakes, with beds interpolated between nodes and banks that rise `MAX_CLIMB` per tile;
   - lay ways into the `way` layer, placing bridges over water and thinning faded ends;
   - paint features in priority order;
   - grow vegetation from biome density plus a grove noise layer (forests with clearings, groves in grassland);
   - add decorations.
     Snow appears in cold areas, with a noise-dithered edge.

## Caves

`caves/`, [ADR 0005](adr/0005-cave-floors-are-layers-linked-at-tile-edges.md). Each stage reads only the ones before it, and a floor reads only its cave's plan.

1. **Siting** (`siting.ts`): a region's peak is a candidate if its mountain is massive (most of a ring of probes is mountain), and a cave if no higher candidate is within `CAVE_SPACING`. A cave's territory is the tiles within `TERRITORY_RADIUS` that are nearer its anchor than any other's.
2. **Plan** (`plan.ts`): one mouth, found by walking out from the anchor until the ground falls to a hashed height; floor 0 is level with the ground outside it. Floors are `FLOOR_SPACING` apart: above, as many as fit under the peak; below, a hashed depth. A ramp joins each floor to the next, placed where both halves have `CEILING` of rock overhead; a floor that can't be reached by ramps is dropped.
3. **Junctions** (`junctions.ts`): neighbouring caves meet, by chance, at adjacent tiles on their shared border, each sloping from its nearest floor to a common height.
4. **Floors** (`floor.ts`): chambers (rough blobs) and the floor's ends (mouth passage, ramp halves, junctions) joined by tunnels routed along their relative neighbourhood graph, under rock where possible. A repair pass then joins any end the tunnels left cut off. Each floor keeps out of the column of the other floors' ramp halves and junction slopes.
5. **Mines** (`mine.ts`, with `floor.ts`): a cave gets a mine with a chance that rises with wayness at its mouth. Its mouth becomes a portal, and the mine adds a hashed number of floors below the cave and, where the mountain has room, above it. On each floor the miners work outward from where they came in (the mouth, or the stairs from the floor nearer the mouth), a hashed number of links along the floor's chamber graph: a rectangle over each chamber, a few square rooms branching off, and 1-wide right-angled corridors between rooms' tunnel doors. Floors beyond the cave lay out chambers and tunnels the same way but don't carve them. Each floor's stairs down (or up) leave a worked room into rock on both floors, and are links like ramps.
6. **Surface:** the mouth is a feature painted on the surface (`∩` for a cave, `Π` for a mine portal, solid) and an opening in the way network; a mine portal is a node with a camp's reach, joined by road.
7. **Mine yards** (`yard.ts`): a feature in front of each mine's portal. A terrace at the portal's level, cut and filled, settles into the ground like a camp's yard, except behind the portal's face, which stays mountain. Props stand in columns either side of a clear middle, chosen by floor count (`MEDIUM_MINE_FLOORS`, `BIG_MINE_FLOORS`): from a campfire and maybe a tent up to stockpile, sheds, bunkhouse and campfire; the terrace is sized to fit them, the layout takes whichever side keeps more of them clear of the ways, any a way still crosses are left out, and a prop clears any trail painted beneath it.

Results for a region (rivers, anchors, placed features, ways) are memoized in an LRU cache inside the world object. The first chunk in a new region pays for the links and features near it. On the author's machine an isolated cold region takes about 220 ms, and a warm chunk about 4 ms (`npm run bench`).

In the browser a Web Worker (`src/chunk-worker.ts`) generates chunks with its own world object. The main thread prefetches chunks nearest first within two view spans of the player (`src/game/chunk-store.ts`), and generates a chunk itself only when it is needed before the worker delivers it, as at startup. Output is identical either way, so this only moves cost.

## Determinism

Peers will generate terrain independently, so results must be bit-identical across JavaScript engines.

- All randomness is counter-based hashing (`src/lib/hash.ts`): `hash(seed, salt, x, y, …)`. There is no stateful random number generator and no `Math.random`.
- Use only operations with exactly specified results: `+ - * /`, `Math.sqrt`, `Math.floor`, `ceil`, `round`, `abs`, `min`, `max`, and integer operations. `Math.sin`, `cos`, `exp`, `pow`, `atan2`, `hypot`, and `**` are implementation-approximated, so keep them out of anything peers must reproduce. `npm run lint` enforces this in `src/lib`, `src/worldgen` and `src/game`, with the preset from `procgen/eslint-determinism`.
- `simplex-noise` uses only exact operations, and it is seeded through the hash.

## Tests

- `*.test.ts` files sit next to their sources. They check:
  - **determinism:** generation order and world instance don't affect results;
  - **golden digests** of four chunks, one crossed by a river (`chunk.test.ts`): update them deliberately, with `-u`, whenever generation is meant to change;
  - **invariants across seeds:** rivers never flow uphill, never narrow downstream, and flow on into another river, the sea or a lake; ways cross land, neighbouring regions agree on the links they share, few ways fade and almost every camp has a road, the spawn is dry and near the origin, and carving (rivers, camps) never makes a step steeper than `max(MAX_CLIMB, natural step)`; ways are walkable up to their far end, or to where they fade, under the game's movement rules (`src/game/ways.test.ts`); caves keep rock overhead, every floor joins its ends, and a walker entering at a mouth reaches every floor and, through junctions, neighbouring caves (`src/game/caves.test.ts`).
- Tests tagged `slow` sweep many seeds or regions; `npm test` skips them; `npm run test:all` and `npm run verify` run them. Tests share one world per seed within a file, since a cold region costs far more than a warm one.
- `chunk.bench.ts` asserts a time budget for a warm chunk.

## Looking at the world

`npm run map` writes a PNG to `artifacts/` (gitignored):

- `--seed N`: the world seed.
- `--x X --y Y`: the centre, in tiles.
- `--size PX`: the image size in pixels.
- `--scale S`: tiles per pixel. The default biome layer samples the fields directly and overlays rivers, roads, paths and features (deep forests tinted, camps and glades marked); it's good for overviews at scale 4–32.
- `--layer tiles`: renders real chunk output (ground, water, props, ways, canopy shaded) with features marked, and needs `--scale 1`.
- `--height shade|tint`: height rendering, as in the game's height modes (`src/view/palette.ts`).

All tuning constants sit at the top of each source file.
