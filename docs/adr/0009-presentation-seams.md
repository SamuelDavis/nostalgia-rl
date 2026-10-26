# Rendering, input, UI and debug are separate seams

The user plans to prototype very different renderers (top-down, fixed isometric, 3D over-the-shoulder, DOOM-style) and to port the shell to SolidJS for UI, menus and input. So each presentation concern sits behind its own seam, and only the composition root (`startGame` in `src/app/start.ts`) knows how they pair:

- **Game** (`src/game`): `createPlay` advances the session on the turn clock and reports each `Turn`. It knows nothing of devices or screens. What a cover hides (`interiorOf`), forest gates and stairways are game semantics here, not drawing details, because every renderer needs them.
- **Input** (`src/input`): devices become `Action`s, through an `Act` function given to `createPlay`, and `Command`s, through `Shortcut`s. A scheme relative to facing, such as tank controls, is a different `Act`; it does not depend on the renderer.
- **Render** (`src/render`): a `Renderer` hears each `Turn`, draws a frame and says how far it can see (`reach`, which drives chunk prefetch). It owns its canvas size, redraw check and camera. Smoothing the player's displayed position, facing and eye level between turns (`createMotion`) is shared by all renderers. Settings and state that only one renderer has, such as top-down zoom and height mode, are methods on that renderer's own type, not on the contract.
- **UI** (`src/ui`): DOM overlays. `debug.ts` turns state into plain `Row`s; `hud.ts` and `map.ts` only show them. The map painter (`src/render/map`) draws into a canvas it is given, so a component can own that canvas. Each map appears whole, never row by row: the overview renders in its own worker (`src/map-worker.ts`, its own `Worldgen`, warmed around the start position) and the local map waits for exactly the chunks it covers.

We considered a renderer that also brings its own controls and debug readout. The user rejected it: rendering, input and debug are different concerns, and pairing them is the root's job.

## Consequences

Known gaps, deferred until a prototype or the port needs them:

- **Lifetime:** listeners, the animation-frame loop and the worker live as long as the page. A SolidJS mount will need `startGame` and the `bind*` functions to return disposers.
- **Picking:** taps map screen quadrants to compass directions (`src/input/tap.ts`), which is only right for a north-up top-down view. An isometric or 3D renderer must supply the screen-to-world mapping.
- **Chunk arrival:** the chunk store says nothing when a chunk arrives, and generates a missing chunk synchronously on the main thread. A renderer that builds meshes per chunk, or sees farther than the prefetch ring, needs an arrival event and must not ask for chunks it has not been sent.
- **Tile reads:** `Terrain` builds an object per tile; meshing a 3D view should read a `Chunk`'s arrays directly.
- **Several layers at once:** a renderer sees one layer, the player's. Isometric or 3D views of buildings need the storeys and roof at a place together, and there is no query for which layers exist there.
- **Facing** has four directions. A free-looking camera is a renderer's own state on top of facing.
