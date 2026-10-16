# Phase 1: World generation

## Goal

Consistent, seeded world generation for a Minecraft-style overworld with biomes, height, and features, presented roguelike-style so the user can explore it and judge it.

## Decisions

Judged in this phase: feel of the turn clock, readability of height, biome and terrain generation. Art style and mechanics are out of scope.

- **Exploration:** `@` moves one tile per turn with WASD. Turns default to 100 ms in this phase so exploring is quick; the real turn length is decided with movement smoothing (see [ideas](../ideas.md#smoothed-grid-movement)). A tap between turns is buffered and acts once (latest tap wins); a held key repeats every turn. No diagonals.
- **Presentation:** glyphs on a canvas; HTML HUD on top showing position and worldgen debug data for the player's tile; M toggles an HTML map of the field-sampled overview (`src/view/overview.ts`).
- **Height resolution:** 256 levels (was 16). At 16, the steepest natural tile rose under half a level, so cliffs could not exist and height bands were ~60 tiles wide.
- **Cliffs:** a step of more than `MAX_CLIMB` (2) levels is impassable, drawn as a dark line on the tile edge. Rivers, banks and camps are shaped so carving never adds cliffs; natural terrain may. Trees, cacti, boulders, tents and campfires block; low plants don't.
- **Swimming:** deep water is passable for now, shown as "swimming" in the HUD. Costs or risks come with game mechanics.
- **Stairs:** a step of any height is allowed between two trail tiles (road, path, bridge), drawn as `≡`. Trails, not terrain, guarantee access.
- **Mountain ledges:** mountain elevation is floored to 16-level steps with a noise-varied phase, so every ledge is a single-tile cliff. Smooth ramps were tried and rejected: wherever a ramp was steeper than `MAX_CLIMB` but wider than a tile, it became a band of cliffs on every tile edge (58% of cliffs). Pass noise to keep mountains climbable without trails was also rejected.
- **Trails:** one route network instead of per-kind walkers, following the [research](../research/worldgen-techniques.md): a relative neighbourhood graph picks links, and weighted A\* routes them over a cost field, discounting tiles already walked so trails merge. Each glade or peak gets 1–5 trails (weights 5:4:3:2:1, as the user suggested). Replaced random-walk forest trails, which crossed into tangles, and random road links. Earlier measurement on seed 1 (before the network): cliffs in multi-tile bands 0.1%, summit reachable, 90% of mountain tiles reachable.
- **Ways are a layer:** roads and paths are stored in `way`, not as ground, so the natural ground underneath is kept. Roads render solid; paths render on a stable 60% of their tiles (hashed by position) so they read as broken footpaths, purely in presentation.
- **Map:** 256 px at 4 tiles/px (1024 tiles across); ~0.4 s to draw in headless Chromium.
- **Height display:** two modes, toggled with H, to compare in playtest. `shade`: ground colour, lightness by height. `tint`: hypsometric colour ramp, ground shown by glyph colour. Both alternate shade every `CONTOUR_INTERVAL` (4) levels.

## Playtest log

_Record user feedback verbatim, newest first, with the commit it refers to._

### 1f1f12c: ledges, trails, glades

> - In general, I really like it.
> - Yeah, the paths in general are pretty straight, which is not awesome.
> - Holy cow, `?seed=1&x=24&y=168` is a rats' nest of crossing paths; I believe this is a mountain and a forest path mixing?
> - I feel that paths should be sporaddic; roads are continuous, but paths are broken up - is that best left purely as a rendering thing, or is it worth baking into the data somehow (e.g. calculate path route then overwrite obstacles, then add path tiles semi-randomly to some percentage? Or, leave it to rendering: in data it's all path and the renderer only draws some of it or something?)
>
> I also want to invite; like how I was able to suggest "why not let things generate normally then add paths on top" feel free to take some time to google or review your training and think: are there idiomatic or accepted ways of doing natural world generation? Are there smart algorithms mathematicians have already proved out for doing this stuff super efficiently? Those sorts of "step back, am I making this more complicated than it needs to be" thinking

Diagnosis: the nest at (24, 168) is one glade's forest trails (3 trails, 10 branches), not a mountain trail; trails ignore each other, so they cross. Research: [worldgen techniques](../research/worldgen-techniques.md).

### 8e5fbda: terraced mountains (second message, after the model proposed hard ledges plus mountain paths)

> Can I suggest, would it be possible/simpler to let the mountains generate normally and then generate mountain paths (like roads, with passability like bridges)?

> go ahead with all of it; also, I think dense forests (perhaps with groves or similar features which can be placed in them) are fine because you could have "forest paths" just like you have "mountain paths", literally the same thing. There would probably be different logic trying to determine how they render. For example, I'd expect mountain paths to zig-zag or circle the mountain, while I'd expect forest paths to be random and branch. It's something to think about; It depends on what "dense forest" means; It could be that where the density is high enough you mark a point (just like a mountain peak) and then have n many forest paths that snake out at random angles (I imagine groves that have more than one enter/exit)

### 8e5fbda: terraced mountains

> I notice boulders/trees are passible, along with tents, campfires
> at 172,406 I found more of the hashed cliffs
> There's an interesting question to raise: I think it should be technically possible to swim.
> It looks like there are only 2 levels of water? shallow and deep? How do the 256 banded levels actually map onto terrain?
> I want to stress about the game data as authoratative: I'm happy to hear feedback on these preferences before they're ever meaningfully committed to.
> In the same vein I have opinions about modularity and ECS and code separation, etc. but whether those add value or not is something I can't easily judge in a world where LLMs are coding.
> I notice the map is pretty massive and takes a while to load.

### 874e602: first walkable world

> I think making mountains terraced is a good idea.
> I notice that bridges over rivers are impassible.
> Is the rendering a separate concern? How difficult would it be to implement smoothing with a little acceleration/deceleration between steps? 250ms seems too slow, but it might be better with the illusion of continuous movement (with accel/decel helping to communicate that it is grid movement). I should say that I want the game to be data-authoratative; rendering is trying to communicate game state, game state shouldn't be dependent on rendering. In a perfect would the UI is totally separate, such that you could swap a CLI for a GUI for a testing harness. Although I'm stating that as a preference, not a requirement. I don't want visualization logic to totally override what we're doing here. -- We could defer all of that to the next phase and, for the purpose of focusing on just map generation here in phase 1, just bump up the speed to, like, 100ms per turn.

Context: unprompted, the model reported that smooth steep mountain flanks became a grid of cliffs on every tile edge, and proposed terracing.
