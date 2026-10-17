# Scale: 1 m tiles, 0.5 m levels, compressed relief

A tile is 1 m square, about the space a person occupies, so one entity fits a tile and horizontal distances in tiles are metres. A height level is 0.5 m (`METRES_PER_LEVEL`), so `MAX_CLIMB` (2 levels) is a 1 m scramble per tile and anything steeper is a cliff. Height is a value per tile, not a voxel; the unequal axes are a conversion factor wherever height meets distance (steepness, line of sight, floor heights). Physical thresholds are written in metres through `metresToLevels`; levels that only tune terrain shape (sea, mountain line, snow) stay as terrain parameters.

Relief is compressed, as in most games: 256 levels give 96 m from sea to the highest peak. To-scale mountains (around 1 km) at today's steepness would need about 10× the levels (16-bit heights) and 10× the horizontal extent, making each mountain several km across and minutes to climb; at today's extent, 98% of mountain ground would be cliff. We kept compression because a mountain then fits a few regions and its whole flank reads within a screen or two; the cost is that elevation means little physically (snowline at 72 m).

## Consequences

- A floor of a building is about 3 m, 6 levels; caves need their mountain's thickness in levels.
- Changing `METRES_PER_LEVEL` changes the feel of every threshold written in metres, not the terrain shape.
- Going to scale later means 16-bit heights and a terrain retune; feature rules written in metres carry over.
