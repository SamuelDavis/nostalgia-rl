# One contiguous world; features instead of instances

There is no overworld and no instancing: houses, caves, dungeons, towns and deep forests are features generated in place, in the same world coordinates as the terrain around them. A feature is placed at an anchor sited per region, built by its own generator within a bounded footprint, and blended into the terrain at its seam. Everything is a pure function of seed and coordinates, so nothing is stored and every peer agrees. We chose this over separate spaces reached by teleporting entrances (the JRPG or Diablo model, researched in [zones and terrain](../research/zones-and-terrain.md)) because the world should feel continuous, and a bespoke generator, not a change of scale, is what makes a feature fit.

## Consequences

- Features are to scale: a house spans many tiles, a deep forest is a large area. An anchor spawns its feature, and the feature's generator owns its whole footprint, including the terrain it sits in. A mine generates the mountain around it; a deep forest generates its trees as well as its glades and paths. It may reshape the terrain so the player feels they are in that place. Siting rules prefer anchors where that reshaping is not jarring.
- Features with insides have floors at the same x, y. Every floor of a cave fits within its mountain; only shafts may extend past it, and every cave has at least one opening. A house or castle can have several floors.
- From outside, a feature shows its cover, as in Ultima: a roof, parapets, a canopy, a mineshaft head. Cover hides the interior until the player is inside, where they see their own floor.
- Ways in the terrain end at a feature's openings, which the feature must respect; inside, its own generator lays its paths.
- A chunk must check every anchor whose maximum footprint could reach it, so feature sizes are capped per type.
- Features may overlap and stack on different floors: a feature reads the claims of higher-priority features nearby, or spawns child features, such as a castle growing a town around itself.
