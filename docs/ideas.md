# Ideas

Candidate directions the user liked. They aren't commitments: adopt one only when a phase calls for it, and record the decision in that phase's doc.

## Spaces: entrances to separately generated maps

The overworld is one space. Entrances on it (mineshafts, house doors, dungeon stairs) teleport to other, finite spaces. Each space is built by its own generator, chosen by entrance type: Rogue-style rooms, cellular-automaton caves, jigsaw dungeons, and so on.

- A space's identity comes from the seed and its entrance, so every peer generates the same one.
- Spaces are persistent and shared like any other world feature, not per-party instances.
- Each floor of a multi-floor dungeon is its own space, linked by stairs.

This allows recognisable, hand-shaped dungeons without complicating the overworld generator.

## World forking and elective persistence

Every peer could keep a full copy of the world's changes. If the host drops, a peer can carry on with its copy as a new, independent world that others can join. A player could later choose to overwrite their own copy with someone else's, which keeps a world persistent across hosts by choice. Host migration is the automatic version of the same thing.

## Ability picks instead of classes

On level-up, players choose abilities from a pool (for example, warrior, wizard, or thief abilities) instead of picking a class, so classes can be mixed freely.
