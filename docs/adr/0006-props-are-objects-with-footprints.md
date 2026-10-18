# Props are objects with footprints, sized to scale

A prop is a static object placed on the ground: a kind, an anchor tile and a footprint of one or more tiles, sized from what the thing measures in the real world (a two-person tent is about 2 × 1.5 m, so 2×2 tiles), then adjusted only where play needs it. Each tile of the footprint holds the prop's kind and its part, its index within the footprint, so a tile knows what it shows and blocks without looking up the object. Features place props; the ground they stand on (height, ground, water, ways) is terrain the feature shapes, not a prop.

The user drew the line: forests and mines are terrain a feature makes, while a tent, cabin or shed is an object, even before any behaviour tells them apart. RimWorld (Things with a size on a separate terrain grid), Dwarf Fortress (3×3 workshops drawn a glyph per tile) and Tiled (object layers over tile layers) draw the same line. We considered keeping props one tile each (tents, sheds and bunkhouses would be out of scale with the 1 m tile, [ADR 0002](0002-scale.md)) and building structures from walls (a building would need a floor plan before it needs one).

## Consequences

- A chunk stores a part per tile beside the prop; the view draws each part with its own glyph.
- A prop is placed whole or not at all: whoever places it checks every tile of its footprint, across chunk seams.
- Props keep their footprint's orientation in the world: a bunkhouse is 10×5 whichever way its yard faces, and layouts work around it. Turning props comes when a layout needs it.
