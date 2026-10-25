# Nostalgia RL

A real-time, open-world roguelike set in one contiguous, seeded, infinite world.

## World

**World**:
The single contiguous map every player moves through freely.

**Terrain**:
The noise-generated base of the world: height, biomes, rivers, and the ways between features.

**Field**:
A continuous value defined at every coordinate of the world, read by biomes and siting rules.

**Base field**:
A field drawn directly from seeded noise, such as continentalness, erosion, temperature or moisture.

**Derived field**:
A field computed from other fields, such as elevation, mountainness or forestness.

**Biome**:
The ambient character of the land at a coordinate, classified from fields, such as forest or mountain. Features, not biomes, give a place its identity.

**Tile**:
One square metre of the world, the space one entity occupies.

**Level**:
The unit of height: half a metre.

**Region**:
A fixed square of the world's grid; each feature type sites its anchors region by region.

**Province**:
The Voronoi cell around a province seat, about a kilometre across, whose identity weights which features appear in it.

**Identity**:
A province's character, taken from the land at its seat: farmland, woodland, highland, wilds, or uncanny where the uncanny field is high.

**Tick**:
The world clock's unit, 10 ms. Every action costs ticks.

**Heading**:
One of eight directions an entity faces and moves in. Tiles and their edges are only ever crossed along the four cardinal directions.

**Body**:
The circle, 0.6 m across, that an entity collides with impassable things by. Its centre decides which tile the entity is in.

**Crossing**:
How a prop is passed: walked through, pushed through, climbed over, or never.

## Features

**Feature**:
A bounded part of the world built by its own generator, such as a house, castle, town, deep forest, glade or cave.

**Anchor**:
The single coordinate a feature is placed at, from which its generator builds outward.

**Siting rule**:
A feature type's criteria for whether an anchor is valid at a location.

**Footprint**:
The bounded area a feature may change, never larger than its type's maximum.

**Seam**:
The band at a footprint's edge where a feature blends into the terrain.

**Floor**:
One vertical layer of a feature, at the same world coordinates as the feature's other floors.

**Cover**:
What a feature shows from outside, such as a roof, parapets, a canopy or a mineshaft head, hiding its interior until a player is inside.

**Purpose**:
Why a feature exists: its role, its occupants, what it produces, and the place it supplies or preys on. NPC intent and quests read it.

**Minor feature**:
A small free-standing feature spread between larger ones so a walker meets something every 15–30 seconds, such as a bandit camp, woodcutter's hut, den, small cave or standing stones.

**Farm**:
A farmhouse, barn and field beside a road out of a settlement, which it supplies with grain, fruit or livestock.

**Settlement**:
A feature of buildings grown along ways around a square. By tier, a hamlet, a village or a town; each tier is larger and has more landmarks.

**Building**:
A child feature of a settlement: walls, doors and floor inside, rooms, and furniture, sized to scale for its kind (cottage, house, barn, smithy, shop, inn, chapel, church, hall).

**Landmark**:
A building a tier of settlement always tries to have, sited first and nearest the square, such as a village's inn or a town's church.

**Square**:
The levelled open ground at a settlement's anchor where its streets meet.

**Lane**:
A street a settlement lays itself, radiating from its square where no way leaves it.

**Storey**:
One floor of a building, 3 m above the one below and reached by stairs; the ground storey is on the surface, each upper storey is its own layer.

**Landing**:
The floor tile at the top of a flight of stairs, on the storey above.

**Roof**:
A building's cover: every tile of the building but its doors.

**Cave**:
A natural feature inside a mountain: winding passages and caverns on several floors.

**Mine**:
A feature dug by people into a cave: square rooms and straight corridors cut along the cave's own chambers and passages, reaching floors deeper than the cave. A cave's child feature, entered by a portal in place of the cave's mouth.

**Yard**:
The terrace levelled in front of a mine's portal, holding the buildings the mine needs.

**Stairs**:
A short, steep flight that miners dug from one floor of a mine to the next.

**Ramp**:
A sloping tunnel that leads from one floor of a cave to the next.

**Junction**:
Where floors of two neighbouring caves meet underground.

**Opening**:
A place where a feature's enclosed parts meet the world, such as a cave mouth or a door.

## Contents

**Prop**:
A static object placed on the ground, such as a tree, boulder, tent or campfire, occupying one or more tiles to scale.

**Part**:
One tile of a prop.

**Entity**:
Something with state or behaviour, such as a player, monster or item.

**Way**:
A road or path that people travel along.

**Node**:
A point that ways or rivers pass through, linked to nearby nodes. The world's lattice holds at most one per cell, and features own child nodes.

**Reach**:
How far a node looks for other nodes to link to.

**Wayness**:
A derived field for how likely ways are to pass through a place; high where land is worth settling, low in empty country.
