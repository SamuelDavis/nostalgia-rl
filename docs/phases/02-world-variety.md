# Phase 2: World variety

## Goal

A world where the player rarely walks far without seeing something interesting, and where every place has a reason to exist that NPCs and quests can later act on.

## Decisions

Decided in an interview with the user (2026-10-24).

- **Density:** something new every 15–30 seconds of walking, about 150–300 tiles at the 100 ms turn. Wild provinces are not sparser: open terrain is connective tissue, and features carry the interest. A feature may invent the terrain it implies (a woodcutter's hut grows forest around it, a watchtower clears fields), so openness comes from features rather than from fewer of them.
- **Provinces:** the world is divided into Voronoi provinces about 1 km across, each with an identity that weights which features appear. The size is a first guess, to be judged in playtest.
- **Fantasy:** an "uncanny" terrain field, thresholded so uncanny provinces are about as common as a biome, rather than a separate system.
- **Politics:** none yet. Rulers and factions come with NPC behaviour.
- **Purpose:** every feature declares its role, occupants, what it produces and what it relates to (a farm supplies its settlement, bandits prey on a road), for future NPC intent and radiant quests.
- **Movement costs** (user's request, 2026-10-25): the "action costs in ticks" idea. The clock ticks every 10 ms; a step on level grass costs 10 ticks (`STEP_TICKS`), so pace is unchanged. Paths and roads are faster; snow and forest a little slower; wading slower, swimming slower still; pushing through trees ×3; slope slows more as it steepens, uphill more than down; cliffs and low obstacles are climbed at a rate per metre, faster down than up. Walls, rock, buildings, tents and wells stay impassable (`Crossing` in `src/worldgen/props.ts`). Rates are first guesses in `src/game/movement.ts`, for playtest.
- **Continuous movement** (replaced tick-counted strides, which snapped back when you turned partway into a tree): the player's centre has a fixed-point offset in thousandths of a tile (`TILE_UNITS`) within its tile, so it stays deterministic. The tile under the centre is the tile you are in, for pace, layer and links; you enter a tile when your centre crosses its edge. Impassable tiles collide with the body, a 0.6 m circle (`BODY_RADIUS`), which slides round corners it catches (door frames). The circle is smaller than a tile so a one-tile gap has slack. Slope pace is spread across the half-tiles either side of an edge; a cliff, or an obstacle you climb onto (`standingHeight`), is climbed in place at its edge, and that progress survives stopping and is abandoned on turning away. Moving sideways keeps the offset on the other axis; there is no drift back to a column's centre (the user's choice, to revisit if clipping or ambiguity shows in playtest). A tap moves to the next tile centre ahead, or as far as a step's ticks reach; holding pushes every tick, and you stop wherever you let go. The renderer interpolates between the last two ticks, and the footstep sway eases out when you stop. The repeat delay went from 50 to 150 ms so a quick tap is one tile.
- **Eight headings** (user's request, 2026-10-25): facing and movement take eight headings (`Heading`); tiles, edges and links stay cardinal (`Direction`), and a diagonal moves along both axes at 1/√2 of the pace, each axis keeping its own slope. Held keys combine per axis, the latest on each axis winning; a key pressed during a tap turns it diagonal, so a chord needn't land in one tick. A tap goes to the next centre on each of its axes. A diagonal against a cliff slides along its foot; a climb needs a cardinal heading, so heading into a corner of two faces stops you. Screen taps split into eight sectors along the screen's own diagonals.
- **Gait** (user's request, 2026-10-25): the rendered footstep follows distance walked along the direction of travel, not tile coordinates per axis, which drifted out of phase on diagonals and swung the glyph in a circle. It surges along the way (slowest at each footfall, one every `STEP_LENGTH` tiles; one per tile read as jitter) and sways slightly across it, alternating sides each step (`gait`).
- **Camera as line of sight** (user's design, 2026-10-25; replaces the phase 1 camera): by default a fixed roguelike view (`OPEN_SPAN`). Sight lines all round the player (`surveyFrom`, recast on entering a tile) are stopped by anything whose top reaches eye level (trees, walls, ground rising past the eye) and partly obscured by shorter things; what is below your feet doesn't count, and passability doesn't matter. A line's obscurity falls off with distance (`lineOfSight`). Lines weigh by how far ahead of the facing they are (none behind), so the view closes most for what is in front of your face; zoom scales with the logarithm of the weighted sight range, all the way in for one thing in your face, a lot but not all the way among many a little way off. The camera leads to the mean centroid of the weighted lines, no further than the sight range, so it sees ahead, keeps a little behind, and draws back toward the player as sight closes. Follow, lead and zoom are critically damped springs (`springToward`), zooming in faster than out, so turning between close and far views flows rather than jitters. Dropped from phase 1: zooming out on high ground, and the tighter view while acting that settled after a pause.
- **First increment:** provinces; a minor-feature layer with bandit camps, woodcutters' huts, dens, small caves, and standing stones for uncanny provinces; farms around settlements. Castles, keeps and watchtowers follow.

## Playtest log

_Record user feedback verbatim, newest first, with the commit it refers to._

### 622552b: gait along the direction of travel

> when traveling diagonally, the character wobbles in a circle. When travelling cardinally, they merely have an accelleration stagger. (This is all visual); no matter what direction they travel, they should have a slight accelleration stagger, but I think it would be good if they had a slight perpendicular stagger as well to give the impression of walking.

A footfall every tile:

> It's a little too fast, it reads like jitter.

A footfall every two tiles:

> pretty good

### d1e1388: movement costs ticks

> If you start to move partway through a tree, stop, then tap left/right, you snap backward and then move left/right. This is an argument in favor of true, floating point movement

Then, in discussion: the player's centre decides which tile they are in, and collision with impassable things is checked at the body's bounds, a circle, "more towards GBA Zelda or other sprite based RPGs". Built as continuous movement (see Decisions).

### 7aa6468: provinces, minor features, farms

> There's a small cave at `?seed=1&x=-454&y=-71`; the entrance is unmarked. There need to be dedicated tiles to distinguish enterances for the different features.
> I see no standing stones at `?seed=3&x=-1163&y=2007`
>
> Farms need not be extremely large and, like camps, they should be able to level terrain. Farms should also be able to clear forests. It's important they be placable.
>
> What factors are driving up cost? Why are the deep forests hitting the slow tag?

The small cave's mouth lay one tile outside its mound, so the mound's edge stayed roofed; it is now a `◠` hollow, and caves are sited only where the ground before the mouth is walkable. Each entrance has its own glyph: door `+`, cave mouth `∩`, mine portal `Π`, small cave `◠`, forest gate `⊓` (it shared `∩` with caves). The stones link was stale, taken before a last siting change. Farms are smaller, level and clear their ground, sit on rings around their settlement and no longer read ways; 21 of a possible 22 around the origin of seed 1, against 7. They had been listed under their settlement's region, so chunks far from it never painted them; procgen now throws on any feature listed outside its cell.
