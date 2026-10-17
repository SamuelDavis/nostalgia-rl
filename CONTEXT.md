# Nostalgia RL

A real-time, open-world roguelike set in one contiguous, seeded, infinite world.

## World

**World**:
The single contiguous map every player moves through freely.
_Avoid_: overworld, instance, space

**Terrain**:
The noise-generated base of the world: height, biomes, rivers, and the ways between features.
_Avoid_: overworld

**Tile**:
One square metre of the world, the space one entity occupies.

**Level**:
The unit of height: half a metre.
_Avoid_: z-level (for floors)

**Region**:
A fixed square of the world's grid that holds at most one anchor per feature type.
_Avoid_: macro cell, zone

## Features

**Feature**:
A bounded part of the world built by its own generator, such as a house, castle, town, deep forest, glade or cave.
_Avoid_: structure, space, instance, landmark

**Anchor**:
The single coordinate a feature is placed at, from which its generator builds outward.

**Siting rule**:
A feature type's criteria for whether an anchor is valid at a location.

**Footprint**:
The bounded area a feature may change, never larger than its type's maximum.

**Seam**:
The band at a footprint's edge where a feature blends into the terrain.
_Avoid_: threshold, border

**Floor**:
One vertical layer of a feature, at the same world coordinates as the feature's other floors.
_Avoid_: level, z-level, storey, layer

**Cover**:
What a feature shows from outside, such as a roof, parapets, a canopy or a mineshaft head, hiding its interior until a player is inside.

**Opening**:
A place where a feature's enclosed parts meet the world, such as a cave mouth or a door.
_Avoid_: entrance, portal

## Contents

**Prop**:
A static object occupying a tile, such as a tree, boulder, tent or campfire.
_Avoid_: feature, entity, decoration

**Entity**:
Something with state or behaviour, such as a player, monster or item.

**Way**:
A road or path that people travel along.
