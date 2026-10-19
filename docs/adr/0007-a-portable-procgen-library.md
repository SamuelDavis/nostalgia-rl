# A portable procgen library, isolated in packages/procgen

World generation machinery that any game could use lives in `packages/procgen`, a package with no dependencies and no access to the game. The game supplies meaning: fields and their constants, zones, tile schemas, feature types and their painting, routing costs, prop footprints. The user plans to prototype many games (top-down, first-person, isometric; fantasy, modern, science fiction) on the same infinite, deterministic, peer-to-peer foundation, so the foundation must not know about any one of them.

The package compiles with `rootDir` set to itself and with only the ES library, so importing from the game, the DOM or Node fails to compile. Copying the directory is how it moves to another project. Its contracts come from [the research](../research/procgen-library.md): randomness is a function, not a stream; every stage declares what it reads and how far, and the world enforces it; features and links declare their extent; each link has one owner; order is total; arithmetic is exact. We considered developing it as `src/procgen` with a lint boundary (simpler, but the boundary is a convention, not a compile error), and as a published package or separate repository (too early with one consumer).

## Consequences

- `src/lib` and parts of `src/worldgen` duplicate the package until the game migrates onto it.
- The determinism lint preset lives in the package, and the game's ESLint config uses it.
- The package's noise hashes gradients per lattice corner instead of using a permutation table. Unlike the table, it has no period, but it is about 3× slower than `simplex-noise`, so migrating the game will change its terrain.
