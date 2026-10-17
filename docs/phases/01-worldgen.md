# Phase 1: World generation

## Goal

Consistent, seeded world generation for a Minecraft-style overworld with biomes, height, and features, presented roguelike-style so the user can explore it and judge it.

## Decisions

Judged in this phase: feel of the turn clock, readability of height, biome and terrain generation. Art style and mechanics are out of scope.

- **Exploration:** `@` moves one tile per turn with WASD. Turns default to 100 ms in this phase so exploring is quick; the real turn length is still open now that movement is smoothed. A tap between turns is buffered and acts once (latest tap wins); a held key repeats every turn. No diagonals.
- **Presentation:** glyphs on a canvas; HTML HUD on top showing position and worldgen debug data for the player's tile; M toggles an HTML map of the field-sampled overview (`src/view/overview.ts`).
- **Displayed motion:** game state stays on the integer grid; the view keeps its own displayed position per moving thing and glides it to each new tile over one turn. The player is drawn as a sprite over the tile layer, so the layer redraws only when the player's height or cover changes. Entities, and props once they can move, follow the same split.
- **Camera:** close and overhead, standing in for what you'd see first-person. It leads the heading, which each turn tick steers toward the facing (about 3 ticks to swing round; zig-zags settle diagonal), so single turns don't jerk it; zoom is recomputed every tick too, so it follows turning on the spot. Zoom follows how far the ground drops away in the heading's direction (8 compass directions, sampled 12 and 24 tiles out): ground rising ahead closes it, falling ground opens it. Settled spans (tiles across the short side) run 14 looking up, 20 on level ground, 64 looking down a slope or off a summit; the camera also leans toward lower ground and away from rising ground. While the player acts, zoom holds practical spans of 10, 14 and 20 by the same measure, so navigating stays agile; after 1.5 s idle it settles. An obstacle or cliff within 3 tiles in the facing direction caps both, from 6 tiles with your nose against it, so a blocked line of sight reads as one. The user's zoom modifier (+/−, wheel) adds tiles on top. The tile layer is drawn at the resting zoom and redraws only when the player moves, the resting zoom changes, or the view leaves an 8-tile margin; easing frames pan and scale it (zoom eases over ~600 ms), so zoom changes are continuous rather than whole-pixel steps.
- **Deep forest:** the first bespoke feature; dense enough (85% trees at the core) that its own paths are the way through. A canopy hides its interior from outside; standing under it reveals the floor, darkened. See [worldgen](../worldgen.md).
- **Scale:** 1 m tiles, 0.5 m levels, compressed relief; see [ADR 0002](../adr/0002-scale.md).
- **Height resolution:** 256 levels (was 16). At 16, the steepest natural tile rose under half a level, so cliffs could not exist and height bands were ~60 tiles wide.
- **Cliffs:** a step of more than `MAX_CLIMB` (2) levels is impassable, drawn as a dark line on the tile edge. Rivers, banks and camps are shaped so carving never adds cliffs; natural terrain may. Trees, cacti, boulders, tents and campfires block; low plants don't.
- **Swimming:** deep water is passable for now, shown as "swimming" in the HUD. Costs or risks come with game mechanics.
- **Stairs:** a step of any height is allowed between two trail tiles (road, path, bridge), drawn as `≡`. Trails, not terrain, guarantee access.
- **Terrain model:** Minecraft-style splines over continentalness, erosion and peaks-and-valleys replace the hand formula ([worldgen](../worldgen.md)), so there are rolling plains, plateaus, cliffs and jagged peaks. Our fbm is stretched ×1.7 to roughly match Minecraft's value range, then thresholds were calibrated by measurement: Mountain biome from level 128 (≈8% of land), river sources from level 107. Peaks follow ridge zero crossings, because Minecraft's fold produced crater rings with our noise.
- **Cliff faces:** a tile with cliffs on 3 or more sides is drawn as rock face, not as a grid of edge lines. Escarpments steeper than a ledge per tile are real cliffs; this only changes how they read.
- **Mountain ledges:** mountain elevation is floored to 16-level steps with a noise-varied phase, so every ledge is a single-tile cliff. Smooth ramps were tried and rejected: wherever a ramp was steeper than `MAX_CLIMB` but wider than a tile, it became a band of cliffs on every tile edge (58% of cliffs). Pass noise to keep mountains climbable without trails was also rejected.
- **Trails:** one route network instead of per-kind walkers, following the [research](../research/worldgen-techniques.md): a relative neighbourhood graph picks links, and weighted A\* routes them over a cost field, discounting tiles already walked so trails merge. Each glade or peak gets 1–5 trails (weights 5:4:3:2:1, as the user suggested). Replaced random-walk forest trails, which crossed into tangles, and random road links. Earlier measurement on seed 1 (before the network): cliffs in multi-tile bands 0.1%, summit reachable, 90% of mountain tiles reachable.
- **Ways are a layer:** roads and paths are stored in `way`, not as ground, so the natural ground underneath is kept. Roads render solid; paths render on a stable 60% of their tiles (hashed by position) so they read as broken footpaths, purely in presentation.
- **Map:** 256 px at 4 tiles/px (1024 tiles across); ~0.4 s to draw in headless Chromium.
- **Height display:** two modes, toggled with H, to compare in playtest. `shade`: ground colour, lightness by height. `tint`: hypsometric colour ramp, ground shown by glyph colour. Both are hillshaded (lit from the northwest, slope averaged over a 7×7 window so single-level steps don't speckle) and drawn with contour lines every `CONTOUR_INTERVAL` (4) levels, darker every 5th (index contours). Replaced alternating shade bands, which showed neither direction nor size of change: a camp 2–3 levels below a gentle shoulder read as sitting in a ditch.
- **Relative height:** in `shade` mode the viewport lightens ground above the player and darkens ground below, saturating 4 m away, instead of shading by absolute height, which barely varies across a close view. The map keeps absolute shading.
- **HUD:** rows update in place, so text stays selectable; the URL tracks the player's position (debounced) for sharing locations.

## Playtest log

_Record user feedback verbatim, newest first, with the commit it refers to._

### 4c23f3f: obstacles close the view

> There's a path that seems to end at `?seed=1&x=-43&y=24` in nothing, is that to be expected?
> Can the motion of the player character also be smoothed? I'm concerned because this might have severe impacts later: I'd like it if entities could be free-moving. I'd want them to snap to the grid, but for visual effects and things they should be separate. I think the same is true of props; the idea that props could be moved and while in data they would have a static, integer, grid location, in the graphics they could have smoothing and other effects applied. In the same way we have these great camera effects happening.
>
> wandering around the clearing at `?seed=1&x=-84&y=9`, the camera view zooms to 10, and then settles at 24. I think that wandering around this open clearing, ~14 is more of the "practical" distance I'd want to see and 20 is the settled distance. Can you use those numbers to try and better adjust what the scales for camera zoom at functional vs rest in the open is like?

The path ends at a glade (-40, 24; radius 5) with a single trail; ordinary glades are unmarked gaps in the trees, so it reads as nothing. Zoom now treats level ground as the middle of the range (practical 14, settled 20), with rising ground ahead narrowing it. The player glides between tiles (see Displayed motion).

### b1442f0: practical zoom while acting

> no it was entirely the zoom: the path was a stair through a cliff and I was struggling to get myself right on that square because I was so zoomed out I couldn't quite see it. I think the paths and the stairs look great.
>
> a couple things:
>
> - `?seed=1&x=84&y=-420`, facing east, my face is against a tree, and yet I have a huge range of vision; arguably with my face right against an obsticle it should be zoomed into like 12 or even 6
> - I think a practical view range would be 10-20, so as you're moving down elevations it can sink to 10 and as you're going up it can raise to 20, all while the settles value is whatever we calculated before so that after some idleness the camera is then, gently, going to zoom to that level. Apply on top of that: when you're nose up against an obstacle like a tree or a cliff then the camera dynamically zooming in to below the "practical" view drives home the impractical reality that your first-person line of sight is taken up by this obstacle

Practical span 10–20 while acting, by the same directional drop as the settled span; obstacles within 3 tiles ahead cap both (6, 10, 14 tiles).

### 1d68d09: continuous zoom

> that's pretty great, but one other camera effect: I think that if you're moving or acting, the camera should want to hover around a particular offset which scales only a little bit with height, but if you stand still/do nothing for a second or two then the camera zooms out to where it should be.
>
> if you see what I mean: it's hard to navigate down a mountain path when you're super zoomed out; you want the camera at a reasonable distance so you can make agile movements and navigate the terrain. However you do want a little bit of zoom scaling to help reinforce the idea that you're going up and down or that you're looking at something obscuring your view versus an open field of view.
>
> I think. I'm a little nervous about it. It definitely feels amazing to have these camera zoom effects: they _really_ reinforce the sense of verticality as you're going up and down small hills or mountains, and climbing to the top of `?seed=1&x=-419&y=-280` to an elevation of 0.922 and having this massive field of view was amazing. However, trying to get back down the mountain was extremely fiddly because I couldn't quite find the path where it becomes only 1 square wide.

Acting now holds zoom near the close view (a quarter of the widening); idling 1.5 s settles to the full view. Paths draw on 60% of tiles, which also hides single-width mountain paths; not changed yet.

### 6bfda2b: heading and zoom per tick

> It's real jerky now, as you turn and the relative zoom level wants to change it's very choppy. If you're standing still and the zoom is fixing itself it feels okay, but if you're also moving then it's very choppy and unpleasant.

Zoom eased in whole-pixel tile sizes (~5% jumps), and every jump redrew the whole layer on top of the per-step redraw. Now zoom eases by scaling a layer drawn at the resting tile size, more slowly.

### e7ae456: close camera, relative height shading

> 1. this is awesome, I love it.
> 2. rather than immediately swinging to your orientation, the camera should lag behind a little, e.g. you need to take a few steps in a direction before it reorients. Otherwise, trying to go diagonally, it jerks vertical then horizontal then vertical again. If you can imagine: you have to have an established direction for a few steps before the camera reorients to face that way.
> 3. standing on the mountain, `/?seed=1&x=-142&y=-5`, grants a huge vision range both below _and above_. I'm not sure how easy this is to fix but, essentially, you should only get that vision range _looking down_. My gut instinct is, if you're facing a steep incline, force the camera to zoom in, then if you turn and look down a slope, let the camera zoom out again. That and/or bias the camera so that it's not just going towards the direction you're looking but also away from steep surfaces.
> 4. I'm not sure about this but I think that the zoom factor should actually be _relative_ elevation rather than absolute elevation?
> 5. I could also imagine zoom based on density of obstructions. Although maybe this is better solved with LOS and shadows.
>
> But you get the gist: leveraging the camera zoom and offset to infer the level of visibility you'd have from first person.

Zoom was already relative (height above the surrounding mean) but undirected. Now the camera follows a step-averaged heading, zooms by the drop in that direction, and leans toward open ground. Obstruction density deferred to field of view ([ideas](../ideas.md#visibility-from-obstructions)). Follow-up from the user: "the zoom is calculated per player step, but it should actually be calculated per turn tick"; heading and zoom now update every tick.

### 5ffd697: deep forest canopy

> The openings need to be much more obvious. In the same way the door to a house will need to have a unique visual queue, or a mineshaft would be obvious, there needs to be a clear "here is where you can enter the trees"
> Look at `?seed=1&x=517&y=1660`, there is no visual indicator that at `?seed=1&x=517&y=1659` I'll be under the canopy. In contrast, the notch at `?seed=1&x=528&y=1668` is very cool, but there still needs to be a very obvious opening.
> I'd recommend a distinct tile, but I could also believe: deeper and more obvious notches guaranteed whereever a path and the forest meet

The forest edge was 45% trees, so the canopy could be entered almost anywhere. Fixed in a308842: a tree wall along the edge, notches running deeper along the path, and a threshold tile (`∩`) where a way passes under cover.

### 2a23ea7: hillshading, contours

> Interestingly there's a black line showing at `?seed=1&x=-5&y=0` and a pale one at `?seed=1&x=-34&y=1`; what's causing those? They appear to be height/cliff bands, but they're passable. The mountain at `?seed=1&x=-159&y=-16` has a lot of very visible lines. I think they must be banding lines?
> You think 1x0.5, so the voxels aren't perfect cubes? Will that have ramifications later? That would mean a single "floor" of a house would need to be 4-8 levels, which is fine as long as that's understood and accounted for.
> Why does retuning become difficult with features built on top? I would have imagined that terrain generation and feature generation are isolated behaviors which have relatively few and well-controlled interaction points?

> looking at the mountain at `?seed=1&x=-142&y=-5`, it seems pretty good. Lots of games use height compression for mountains. I'm curious to see what a "to scale" mountain would look like for reference, but I suspect we can use scaled mountains.

Those were contour lines styled too close to cliffs; contours are now thin and brown (2a23ea7). Scale settled in ADR 0002.

### 4d51948: feature system, camps

> Looking at `?seed=1&x=20304&y=118`, that camp is lower than the surrounding terrain. But I suppose this is me misinterpreting just how much the height difference is? I guess I don't have a very good understanding of what the relative shading bands mean; is it a big elevation difference or small? That's a problem worth sorting out.

> I do want to sort out scale and it should probably be sorted out sooner rather than later. I'm tempted to say each tile is 1 meter square (a reasonable approximation of the space a person takes up) Or, as you suggeset now: 0.5 meters; I'm not sure what factors go into choosing the scale? I'm happy to go more fine-grained unless that's going to cause problems later.
> I also want to mention: the hud appears to be redrawing entirely every tick so I can't highlight and copy things. I'd like it if the UI were stable and could be interacted with like a normal web page.
> Also, it would be extremely useful if there were either a "copy" button on the position or if the url itself would update the x/y coordinates as I move around.

The camp is 3 levels below the shoulder over ~15 tiles. Fixed presentation with hillshading and index contours; HUD and URL fixed. Scale pending.

### 25f0920: spline terrain

> It's looking really good so far.
> `?seed=1&x=-735&y=-1337` is interesting: a path goes across a beach and cuts into the water, creating bridge tiles. That doesn't really make sense. Maybe that needs to be fixed with the generator, perhaps it can just be fixed visually (in the sense of forest paths which appear broken but aren't)

Fixed in the generator: routes tested dryness on pre-ledge height and only at nodes, and paving bridged any water. Routes now check real height at nodes and step midpoints, and ways are never laid on sea.

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
