# Generation is a pure function; mutation is a delta layer

Generation stays a pure function of seed and coordinates: fields, biomes, feature siting, layouts and paint. Anything that changes the world afterwards (felled trees, dug tunnels, built houses, towns that grow) is a separate, sparse layer of deltas over the generated tiles, attributed and synced between peers. We considered making feature placement stateful, so placers could run as the world is revealed and react to what they had already placed. We kept generation pure because a stateful placer makes the world depend on exploration order: peers exploring different frontiers disagree and need an authority, late joiners need the history, and reaching a distant place means generating everything its placement depended on. Purity costs only two rules: a stage reads earlier stages within a bounded radius, and links between anchors have a fixed owner.

## Consequences

- Peers agree on the untouched world from the seed alone; only deltas are stored or sent.
- Placers decide from fields and other anchors' candidates in a bounded neighbourhood, never from what was generated before. Generating ahead of the player is a cache, never an input.
- Simulation that changes the world over time (history, growing towns) writes deltas rather than making generation stateful.
- The delta layer, its storage and its sync are unbuilt.
