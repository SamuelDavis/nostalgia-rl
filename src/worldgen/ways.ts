import {
  type Bounds,
  type Dependency,
  type Pair,
  type Grid,
  type Joint,
  type Reader,
  type RouteFailure,
  type Stage,
  type Vec2,
  boundsOf,
  byPosition,
  contains,
  distance,
  expand,
  grid,
  links,
  network,
  projectOntoSegment,
  relativeNeighbours,
  rngOf,
  samePoint,
  simplex2,
  stage,
} from "procgen";
import { biomeOf } from "./biome";
import { SEA_LEVEL, heightLevel } from "./constants";
import { fewerMoreLikely } from "./counts";
import type { Camp } from "./features/camp";
import type { Settlement } from "./features/settlement/layout";
import type { Opening } from "./features/feature";
import type { Fields } from "./fields";
import type { Peak } from "./landmarks";
import { regions } from "./region";
import { climbCost, route } from "./routing";
import { Biome, Way } from "./terrain";

export type LinkedWay = Exclude<Way, typeof Way.None>;

export interface WayLink {
  readonly nodes: readonly Vec2[];
  readonly way: LinkedWay;
  readonly fades: readonly Vec2[];
  readonly bounds: Bounds;
}

const wayKey = ({ nodes, way }: WayLink) => {
  const [first, last] = [nodes[0]!, nodes.at(-1)!];
  return `${way}|${first.x},${first.y}|${last.x},${last.y}`;
};

export const distinctWays = (links: readonly WayLink[]): WayLink[] => [
  ...new Map(links.map((link) => [wayKey(link), link])).values(),
];

export interface CaveMouth {
  readonly opening: Opening;
  readonly isMine: boolean;
}

export const WAY_SHAPES: Record<LinkedWay, { readonly halfWidth: number; readonly clearance: number }> = {
  [Way.Road]: { halfWidth: 1.1, clearance: 1.5 },
  [Way.Path]: { halfWidth: 0.8, clearance: 0.6 },
};

export const isOnWay = (links: readonly WayLink[], p: Vec2): boolean =>
  links.some(({ nodes, way }) =>
    nodes.some((a, i) => {
      const b = nodes[i + 1];
      return (
        b !== undefined &&
        projectOntoSegment({ x: p.x + 0.5, y: p.y + 0.5 }, a, b).distance <= WAY_SHAPES[way].halfWidth
      );
    }),
  );

const NodeKind = { Lattice: 0, Camp: 1, Peak: 2, Opening: 3, Stub: 4, Entrance: 5, Settlement: 6 } as const;
type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

interface WayNode extends Vec2 {
  readonly kind: NodeKind;
  readonly wayness: number;
  readonly heading?: Vec2;
  readonly departure?: Vec2;
}

interface Doorway {
  readonly opening: Opening;
  readonly isMouth: boolean;
}

const CELL = 128;
const NODE_MARGIN = 16;
const BIOME_WAYNESS: Record<Biome, number> = {
  [Biome.Ocean]: 0,
  [Biome.Beach]: 0.2,
  [Biome.Grassland]: 0.45,
  [Biome.Forest]: 0.3,
  [Biome.Desert]: 0.15,
  [Biome.Mountain]: 0.2,
};
const CAMP_PULL = 0.5;
const CAMP_PULL_RANGE = 2 * CELL;
const SETTLEMENT_PULL = 0.6;
const SETTLEMENT_PULL_RANGE = 3 * CELL;
const ROAD_WAYNESS = 0.7;
const REACH: Record<NodeKind, number> = {
  [NodeKind.Lattice]: 1.5 * CELL,
  [NodeKind.Camp]: 3 * CELL,
  [NodeKind.Peak]: 2 * CELL,
  [NodeKind.Opening]: CELL,
  [NodeKind.Stub]: 0,
  [NodeKind.Entrance]: 3 * CELL,
  [NodeKind.Settlement]: 3 * CELL,
};
const ROAD_ENDS: ReadonlySet<NodeKind> = new Set([NodeKind.Camp, NodeKind.Entrance, NodeKind.Settlement]);
const STUB_LENGTH = 40;
const CLEAR_OF_MOUTH = 4;
const MAX_REACH = REACH[NodeKind.Camp];
const MAX_LATTICE_LINKS = 3;
const ROUTE_MARGIN = 32;
const WOBBLE_SCALE = 48;
const TYPICAL_UNIT_COST = 2;

const wayCells = grid(CELL);

const around = (p: Vec2, radius: number) => boundsOf([p], radius);

const headingOf = ({ inside, outside }: Opening): Vec2 => {
  const length = distance(inside, outside);
  return { x: (outside.x - inside.x) / length, y: (outside.y - inside.y) / length };
};

export interface WaynessInput {
  readonly fields: Fields;
  readonly camps: Stage<readonly Camp[]>;
  readonly settlements: Stage<readonly Settlement[]>;
}

export const createWayness = ({ fields, camps, settlements }: WaynessInput) => {
  const pullOf = (reader: Reader, p: Vec2, sites: Stage<readonly Vec2[]>, range: number) =>
    Math.max(0, ...reader.gather(sites, around(p, range)).map((site) => 1 - distance(site, p) / range));
  return {
    camps,
    settlements,
    reads: (margin: number): Dependency[] => [
      { stage: camps, radius: CAMP_PULL_RANGE + margin },
      { stage: settlements, radius: SETTLEMENT_PULL_RANGE + margin },
    ],
    at: (reader: Reader, p: Vec2): number =>
      BIOME_WAYNESS[biomeOf(fields.conditions(p.x, p.y))] +
      Math.max(
        CAMP_PULL * pullOf(reader, p, camps, CAMP_PULL_RANGE),
        SETTLEMENT_PULL * pullOf(reader, p, settlements, SETTLEMENT_PULL_RANGE),
      ),
  };
};

export type Wayness = ReturnType<typeof createWayness>;

export interface WaySiting {
  readonly seed: number;
  readonly fields: Fields;
  readonly wayness: Wayness;
  readonly peaks: Stage<Peak | undefined>;
  readonly forestOpenings: Stage<readonly Opening[]>;
  readonly forestOpeningReach: number;
  readonly caveMouths: Stage<readonly CaveMouth[]>;
  readonly caveMouthReach: number;
}

export const createWays = ({
  seed,
  fields,
  wayness,
  peaks,
  forestOpenings,
  forestOpeningReach,
  caveMouths,
  caveMouthReach,
}: WaySiting) => {
  const rng = rngOf(seed, "ways");
  const wobble = simplex2(rng.child("wobble").key);
  const level = (p: Vec2) => heightLevel(fields.elevation(p.x, p.y));
  const trailLevel = (p: Vec2) => heightLevel(fields.elevationBeforeLedges(p.x, p.y));
  const isDry = (p: Vec2) => level(p) > SEA_LEVEL;

  const nodes = stage({
    name: "way nodes",
    grid: wayCells,
    reads: [...wayness.reads(0), { stage: peaks, radius: 0 }],
    compute: (cell, context): readonly WayNode[] => {
      const area = wayCells.boundsOf(cell);
      const region = regions.cellOf({ x: area.minX, y: area.minY });
      const anchors = [
        ...context.read(wayness.camps, region).map((camp) => ({ ...camp, kind: NodeKind.Camp, wayness: 1 })),
        ...context
          .read(wayness.settlements, region)
          .map((settlement) => ({ ...settlement, kind: NodeKind.Settlement, wayness: 1 })),
        ...[context.read(peaks, region) ?? []].flat().map((peak) => ({ ...peak, kind: NodeKind.Peak, wayness: 0 })),
      ]
        .filter((anchor) => contains(area, anchor))
        .map(({ x, y, kind, wayness: w }) => ({ x, y, kind, wayness: w }));
      const p = {
        x: area.minX + context.rng.int(NODE_MARGIN, CELL - NODE_MARGIN, 0),
        y: area.minY + context.rng.int(NODE_MARGIN, CELL - NODE_MARGIN, 1),
      };
      const w = isDry(p) ? wayness.at(context, p) : 0;
      return context.rng.chance(w, 2) ? [...anchors, { ...p, kind: NodeKind.Lattice, wayness: w }] : anchors;
    },
  });

  const join = (from: WayNode, to: WayNode): Joint<LinkedWay> | RouteFailure => {
    const isRoad =
      [from.kind, to.kind].some((kind) => ROAD_ENDS.has(kind)) || Math.min(from.wayness, to.wayness) >= ROAD_WAYNESS;
    const start = from.departure ?? from;
    const found = route(start, to, {
      gradeLevel: isRoad ? level : trailLevel,
      isOpen: isDry,
      unitCost: (grade, at) => 1 + 0.6 * (1 + wobble(at.x / WOBBLE_SCALE, at.y / WOBBLE_SCALE)) + climbCost(grade),
      typicalUnitCost: TYPICAL_UNIT_COST,
      margin: ROUTE_MARGIN,
    });
    if (!("path" in found)) return found;
    return { edge: isRoad ? Way.Road : Way.Path, path: from.departure ? [from, ...found.path] : found.path };
  };

  const lattice = network<WayNode, LinkedWay>({
    name: "ways",
    nodes,
    reach: MAX_REACH,
    reachOf: (node) => REACH[node.kind],
    spread: ROUTE_MARGIN,
    neighbours: (node, candidates) => {
      const sorted = relativeNeighbours(node, candidates).sort((a, b) => distance(node, a) - distance(node, b));
      if (node.kind !== NodeKind.Lattice) return sorted;
      return sorted.slice(0, rng.weighted(fewerMoreLikely(MAX_LATTICE_LINKS), node.x, node.y));
    },
    join: (from, to) => join(from, to),
  });

  const degreeOf = (reader: Reader, node: WayNode) =>
    reader.readAt(lattice.adjacency, node).find((adjacent) => samePoint(adjacent.node, node))?.linked.length ?? 0;

  const isDeadEnd = (reader: Reader, node: WayNode) =>
    node.kind === NodeKind.Stub || (node.kind === NodeKind.Lattice && degreeOf(reader, node) === 1);

  const stubOf = (opening: WayNode): WayNode => ({
    x: Math.round(opening.x + opening.heading!.x * STUB_LENGTH),
    y: Math.round(opening.y + opening.heading!.y * STUB_LENGTH),
    kind: NodeKind.Stub,
    wayness: 0,
  });

  const openingNode = ({ opening, isMouth }: Doorway, kind: NodeKind): WayNode => {
    const heading = headingOf(opening);
    const node = { ...opening.outside, kind, wayness: 0, heading };
    if (!isMouth) return node;
    const departure = {
      x: Math.round(node.x + heading.x * CLEAR_OF_MOUTH),
      y: Math.round(node.y + heading.y * CLEAR_OF_MOUTH),
    };
    return { ...node, departure };
  };

  const attachmentsOf = (
    name: string,
    kind: typeof NodeKind.Opening | typeof NodeKind.Entrance,
    sources: readonly Dependency[],
    openingsIn: (context: Reader, area: Bounds) => readonly Doorway[],
  ) => {
    const reach = REACH[kind];
    const pairs = stage({
      name: `${name} pairs`,
      grid: wayCells,
      reads: [...sources, { stage: nodes, radius: reach }, { stage: lattice.adjacency, radius: reach }],
      compute: (cell, context): readonly Pair<WayNode>[] => {
        const area = wayCells.boundsOf(cell);
        return openingsIn(context, area)
          .map((opening) => openingNode(opening, kind))
          .filter((opening) => contains(area, opening))
          .map((opening) => {
            const [nearest] = context
              .gather(nodes, around(opening, reach))
              .filter((node) => distance(node, opening) <= reach && !isDeadEnd(context, node))
              .sort((a, b) => distance(opening, a) - distance(opening, b) || byPosition(a, b));
            return [opening, nearest ?? stubOf(opening)] as const;
          });
      },
    });
    return links({ name, pairs, reach, spread: ROUTE_MARGIN, join: (from, to) => join(from, to) });
  };

  const attachments = [
    attachmentsOf(
      "way openings",
      NodeKind.Opening,
      [
        { stage: forestOpenings, radius: forestOpeningReach },
        { stage: caveMouths, radius: caveMouthReach },
      ],
      (context, area) => [
        ...context
          .gather(forestOpenings, expand(area, forestOpeningReach))
          .map((opening) => ({ opening, isMouth: false })),
        ...context
          .gather(caveMouths, expand(area, caveMouthReach))
          .flatMap(({ opening, isMine }) => (isMine ? [] : [{ opening, isMouth: true }])),
      ],
    ),
    attachmentsOf(
      "way entrances",
      NodeKind.Entrance,
      [{ stage: caveMouths, radius: caveMouthReach }],
      (context, area) =>
        context
          .gather(caveMouths, expand(area, caveMouthReach))
          .flatMap(({ opening, isMine }) => (isMine ? [{ opening, isMouth: true }] : [])),
    ),
  ];

  const nearStages = new Map<string, Stage<readonly WayLink[]>>();
  const near = (target: Grid, margin = 0) => {
    const key = `${target.size}+${margin}`;
    const existing = nearStages.get(key);
    if (existing) return existing;
    const main = lattice.near(target, margin);
    const attached = attachments.map((attachment) => attachment.near(target, margin));
    const created = stage({
      name: `ways near ${key}`,
      grid: target,
      reads: [
        { stage: main, radius: 0 },
        ...attached.map((stage) => ({ stage, radius: 0 })),
        { stage: lattice.adjacency, radius: MAX_REACH + ROUTE_MARGIN + margin },
      ],
      compute: (cell, context): readonly WayLink[] => [
        ...context.read(main, cell).map(({ path, edge, from, to, bounds }) => ({
          nodes: path,
          way: edge,
          fades: [from, to].filter((end) => isDeadEnd(context, end)),
          bounds,
        })),
        ...attached
          .flatMap((stage) => context.read(stage, cell))
          .map(({ path, edge, to, bounds }) => ({
            nodes: path,
            way: edge,
            fades: to.kind === NodeKind.Stub ? [to] : [],
            bounds,
          })),
      ],
    });
    nearStages.set(key, created);
    return created;
  };

  return { nodes, near };
};
