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

## Feature interiors on the map

The map is a surface overview: it marks where features are (a deep forest's extent and glade, a cave's mouth) but not their insides. It could also show the interior of the feature the player is in, such as a deep forest's paths or the current cave floor.
