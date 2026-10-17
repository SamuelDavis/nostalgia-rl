# Ways and rivers are networks on a node lattice

Ways and rivers are built from nodes linked only to nearby nodes, never routed end to end. The world is a lattice of cells, each holding at most one node at a jittered position that both neighbours compute alike. Features own child nodes (a camp's yard, a forest's openings, a peak, a mine mouth). Each node has a reach, how far it looks for nodes to link to: a camp reaches far, so it almost always joins the network; a forest path reaches little, so some fade out. A wayness field, raised by what makes land worth settling and lowered by empty country, decides where lattice nodes exist, so ways are dense around camps and run out in empty fields and valleys. Rivers use the same lattice: each node drains to its lowest neighbour by drainage, and a link carries a river where enough upstream cells drain into it, counted within a bounded radius, so rivers gather tributaries and widen downstream.

We replaced routing between distant landmarks (roads from camp to camp, trails from landmark to landmark, rivers traced from a source until they reach the sea). That gave purposeful point-to-point ways, but a cold chunk had to route every way its features might read: roads from 9×9 regions and trails from 5×5, 5–500 ms per new region. Single traced rivers never merged, so they were rare and random. We also considered hashed crossing points on region edges ([research](../research/zones-and-terrain.md#edge-matched-region-generation)); the lattice subsumes it with finer, jittered nodes and lets features add nodes of their own.

## Consequences

- Generating a chunk reads only links within a bounded number of cells; no route spans more than neighbouring nodes.
- A way can end where no node is within reach. That is intended, if rare, and the view fades it out.
- Roads no longer lead deliberately from one camp to another; following one leads into the network that camps join.
- A river's size is capped by the upstream radius it counts, so very long rivers stop widening.
- Each link is decided by one owner, as with every link between anchors ([ADR 0003](0003-pure-generation-mutation-as-deltas.md)).
