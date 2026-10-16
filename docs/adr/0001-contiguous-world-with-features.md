# One contiguous world; features instead of instances

There is no overworld and no instancing: houses, caves, dungeons, towns and deep forests are features generated in place, in the same world coordinates as the terrain around them. A feature is placed at an anchor sited per region, built by its own generator within a bounded footprint, and blended into the terrain at its seam. Everything is a pure function of seed and coordinates, so nothing is stored and every peer agrees. We chose this over separate spaces reached by teleporting entrances (the JRPG or Diablo model, researched in [zones and terrain](../research/zones-and-terrain.md)) because the world should feel continuous, and a bespoke generator, not a change of scale, is what makes a feature fit.

## Consequences

- Features with insides have vertical levels at the same x, y: a cave under a mountain goes up or down within the mountain's bounds and must guarantee at least one opening to the world; a house or castle can have storeys.
- From outside, a feature shows its exterior over its interior, as in Ultima: a roof, parapets, a canopy, a mineshaft head.
- A chunk must check every anchor whose maximum footprint could reach it, so feature sizes are capped per type.
- Features may overlap: a feature reads the claims of higher-priority features nearby, or spawns child features, such as a castle growing a town around itself.
