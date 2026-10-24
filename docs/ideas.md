# Ideas

Candidate directions the user liked. They aren't commitments: adopt one only when a phase calls for it, and record the decision in that phase's doc.

## Feature generators

Superseded the earlier "spaces" idea (separate maps behind teleporting entrances): see [ADR 0001](adr/0001-contiguous-world-with-features.md). Candidate feature types, each with its own generator: Rogue-style cave levels under mountains, multi-storey houses and castles, towns, deep forests and their glades. Multi-level dungeons are one feature with several vertical levels, linked by stairs.

## Staged feature pipeline

Features declare which earlier stages they read (fields, biomes, other features' anchors) instead of taking hand-wired siting arguments, and roads, trails, rivers, glades and peaks become features too. Parent features could spawn any number of children, such as a castle growing a town, or a deep forest holding several features within it, its glades among them. Stages read only earlier stages within a bounded radius ([ADR 0003](adr/0003-pure-generation-mutation-as-deltas.md)).

## World forking and elective persistence

Every peer could keep a full copy of the world's changes. If the host drops, a peer can carry on with its copy as a new, independent world that others can join. A player could later choose to overwrite their own copy with someone else's, which keeps a world persistent across hosts by choice. Host migration is the automatic version of the same thing.

## Ability picks instead of classes

On level-up, players choose abilities from a pool (for example, warrior, wizard, or thief abilities) instead of picking a class, so classes can be mixed freely.

## Visibility from obstructions

Close the view in dense trees, as the camera already closes when looking uphill. Probably better as field of view: line of sight with shadows cast by trees and rising ground, the tutorial's next step after movement.

## Action costs in ticks

Keep the turn clock short and give each action a cost in ticks, so speed varies per action and entity: slower up steep inclines, faster on a horse. Decouples responsiveness and network budget (the tick) from pace (the cost).

## Mining camp on its own flat

A big mine's bunkhouse and campfire on a small flat of their own beside the yard, joined by a short path, instead of on the yard's terrace: miners sleep away from the work, and from afar a big mine shows two flats. The user chose one terrace for now.

## Mine planking and shoring

Planking along the line the miners followed, from the portal through each corridor to every stair, so a mine has paths to orient by as forests do; each time the line met a cave chamber, the miners cleared a room. Shoring props lining the walls of worked passages and rooms.

## Chasms

Open drops through cave floors, for a sense of depth underground.
