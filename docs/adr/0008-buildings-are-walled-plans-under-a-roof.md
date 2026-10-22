# Enterable buildings are walled plans under a roof

A building a player can enter is a plan of tiles, not a prop: a rectangle of walls with doors in its front wall, floor inside, interior walls dividing rooms, and furniture as one-tile props. The plan is drawn in its own frame (`u` across the front, `v` inward) and turned to face its street, so any building can face any way. A roof covers every tile but the doors. From outside a building shows its roof; standing under it reveals that building alone, the roofed tiles connected to the player's. The user asked for buildings sized to scale and varied by kind, with insides, as children of a settlement, and later with floors above, like a mine.

[ADR 0006](0006-props-are-objects-with-footprints.md) deferred structures built from walls because no building needed a floor plan yet; enterable buildings do. Tents, sheds, stockpiles and bunkhouses stay props: they have no inside.

## Consequences

- A plan is laid out once per building, then painted tile by tile; furniture goes only where every floor tile stays reachable from a door.
- Cover now has kinds with different reveal rules: a canopy reveals all canopy, a roof reveals its own building. Buildings keep a gap, so roofs never touch.
- A building's upper storeys are layers at the same x, y, keyed by its door, linked by stairs like a cave's floors ([ADR 0005](0005-cave-floors-are-layers-linked-at-tile-edges.md)). A storey's chunk is the surface with that building's floor painted over it, so from upstairs you look down on the world around.
