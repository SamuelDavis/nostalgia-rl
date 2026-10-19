# The procgen library lives in its own repository, beside the game

World generation machinery that any game could use lives in [procgen](../../../procgen), a separate repository checked out beside this one (`~/Code/procgen`), with no dependencies and no access to any game. This game depends on it as `"procgen": "file:../procgen"`, a symlink in `node_modules`, so both are edited together and the game always runs the library's working tree. The game supplies meaning: fields and their constants, zones, tile schemas, feature types and their painting, routing costs, prop footprints. The user plans to prototype many games (top-down, first-person, isometric; fantasy, modern, science fiction) on the same infinite, deterministic, peer-to-peer foundation, so the foundation must not know about any one of them.

The library compiles with `rootDir` set to itself and with only the ES library, so importing from a game, the DOM or Node fails to compile. Its contracts and their sources are in its [research](../../../procgen/docs/research.md). We first built it inside this repo as `packages/procgen`; the user moved it out so other games can use it as an independent project. A published package was rejected for now: every change would need a release before the game could use it.

## Consequences

- Cloning this game means cloning `procgen` beside it, then `npm install`.
- Its tests, lint and typecheck run in its own repo (`npm run verify` there); this repo's gate covers only the game.
- The determinism lint preset comes from `procgen/eslint-determinism`.
- `src/lib` and parts of `src/worldgen` duplicate the library until the game migrates onto it. The library's noise hashes gradients per lattice corner, so migrating will change the terrain.
