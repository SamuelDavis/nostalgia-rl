# Phase 1: World generation

## Goal

Consistent, seeded world generation for a Minecraft-style overworld with biomes, height, and features, presented roguelike-style so the user can explore it and judge it.

## Decisions

Judged in this phase: feel of the turn clock, readability of height, biome and terrain generation. Art style and mechanics are out of scope.

- **Exploration:** `@` moves one tile per turn with WASD. Turns default to 100 ms in this phase so exploring is quick; the real turn length is decided with movement smoothing (see [ideas](../ideas.md#smoothed-grid-movement)). A tap between turns is buffered and acts once (latest tap wins); a held key repeats every turn. No diagonals.
- **Presentation:** glyphs on a canvas; HTML HUD on top showing position and worldgen debug data for the player's tile; M toggles an HTML map of the field-sampled overview (`src/view/overview.ts`).
- **Height resolution:** 256 levels (was 16). At 16, the steepest natural tile rose under half a level, so cliffs could not exist and height bands were ~60 tiles wide.
- **Cliffs:** a step of more than `MAX_CLIMB` (2) levels is impassable, drawn as a dark line on the tile edge. Rivers, banks and camps are shaped so carving never adds cliffs; natural terrain may. Deep water is impassable except by bridge; features are not, for now.
- **Terraced mountains:** in mountains, elevation is terraced (`terrace` in `src/lib/math.ts`) into 16-level steps with a noise-varied phase, so steepness gathers into discrete ledges with walkable treads, not a uniform impassable slope. Measured on seed 1 near its steepest flank: summit reachable on foot, 88% of mountain tiles reachable.
- **Height display:** two modes, toggled with H, to compare in playtest. `shade`: ground colour, lightness by height. `tint`: hypsometric colour ramp, ground shown by glyph colour. Both alternate shade every `CONTOUR_INTERVAL` (4) levels.

## Playtest log

_Record user feedback verbatim, newest first, with the commit it refers to._

### 874e602: first walkable world

> I think making mountains terraced is a good idea.
> I notice that bridges over rivers are impassible.
> Is the rendering a separate concern? How difficult would it be to implement smoothing with a little acceleration/deceleration between steps? 250ms seems too slow, but it might be better with the illusion of continuous movement (with accel/decel helping to communicate that it is grid movement). I should say that I want the game to be data-authoratative; rendering is trying to communicate game state, game state shouldn't be dependent on rendering. In a perfect would the UI is totally separate, such that you could swap a CLI for a GUI for a testing harness. Although I'm stating that as a preference, not a requirement. I don't want visualization logic to totally override what we're doing here. -- We could defer all of that to the next phase and, for the purpose of focusing on just map generation here in phase 1, just bump up the speed to, like, 100ms per turn.

Context: unprompted, the model reported that smooth steep mountain flanks became a grid of cliffs on every tile edge, and proposed terracing.
