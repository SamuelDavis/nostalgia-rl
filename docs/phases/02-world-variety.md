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
- **First increment:** provinces; a minor-feature layer with bandit camps, woodcutters' huts, dens, small caves, and standing stones for uncanny provinces; farms around settlements. Castles, keeps and watchtowers follow.

## Playtest log

_Record user feedback verbatim, newest first, with the commit it refers to._

### 7aa6468: provinces, minor features, farms

> There's a small cave at `?seed=1&x=-454&y=-71`; the entrance is unmarked. There need to be dedicated tiles to distinguish enterances for the different features.
> I see no standing stones at `?seed=3&x=-1163&y=2007`
>
> Farms need not be extremely large and, like camps, they should be able to level terrain. Farms should also be able to clear forests. It's important they be placable.
>
> What factors are driving up cost? Why are the deep forests hitting the slow tag?

The small cave's mouth lay one tile outside its mound, so the mound's edge stayed roofed; it is now a `◠` hollow, and caves are sited only where the ground before the mouth is walkable. Each entrance has its own glyph: door `+`, cave mouth `∩`, mine portal `Π`, small cave `◠`, forest gate `⊓` (it shared `∩` with caves). The stones link was stale, taken before a last siting change. Farms are smaller, level and clear their ground, sit on rings around their settlement and no longer read ways; 21 of a possible 22 around the origin of seed 1, against 7. They had been listed under their settlement's region, so chunks far from it never painted them; procgen now throws on any feature listed outside its cell.
