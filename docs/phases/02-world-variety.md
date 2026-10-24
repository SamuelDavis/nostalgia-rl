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
