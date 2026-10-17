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

**Opening**:
A place where a feature's enclosed parts meet the world, such as a cave mouth or a door.

## Contents

**Prop**:
A static object occupying a tile, such as a tree, boulder, tent or campfire.

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
