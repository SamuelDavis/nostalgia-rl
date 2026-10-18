import {
  type Point,
  countBiasedLow,
  createNoise,
  distance,
  floorDiv,
  hash,
  hashString,
  intBetween,
  memoize,
  relativeNeighbours,
  unit,
} from "../lib";
import { biomeOf } from "./biome";
import { REGION_SIZE, SEA_LEVEL, heightLevel } from "./constants";
import type { Fields } from "./fields";
import { type Region, boundsOf, overlaps, regionBounds, regionKey, regionsAround } from "./region";
import { climbCost, route } from "./routing";
import type { Opening } from "./features/deep-forest";
import { Biome, Way } from "./terrain";

export type LinkedWay = Exclude<Way, typeof Way.None>;

export interface WayLink {
  readonly nodes: readonly Point[];
  readonly way: LinkedWay;
  readonly fades: readonly Point[];
}

export interface WaySiting {
  readonly seed: number;
  readonly fields: Fields;
  readonly campAt: (region: Region) => Point | undefined;
  readonly peakOf: (region: Region) => Point | undefined;
  readonly openingsIn: (region: Region) => readonly Opening[];
  readonly entrancesIn: (region: Region) => readonly Opening[];
}

export interface WaynessInput {
  readonly fields: Fields;
  readonly campAt: (region: Region) => Point | undefined;
}

export const WAY_SHAPES: Record<LinkedWay, { readonly halfWidth: number; readonly clearance: number }> = {
  [Way.Road]: { halfWidth: 1.1, clearance: 1.5 },
  [Way.Path]: { halfWidth: 0.8, clearance: 0.6 },
};

const NodeKind = { Lattice: 0, Camp: 1, Peak: 2, Opening: 3, Stub: 4, Entrance: 5 } as const;
type NodeKind = (typeof NodeKind)[keyof typeof NodeKind];

interface WayNode extends Point {
  readonly key: string;
  readonly kind: NodeKind;
  readonly wayness: number;
  readonly heading?: Point;
}

interface Cell {
  readonly col: number;
  readonly row: number;
}

const SALT = hashString("ways");
const CELL = 128;
const CELLS_PER_REGION = REGION_SIZE / CELL;
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
const ROAD_WAYNESS = 0.7;
const REACH: Record<NodeKind, number> = {
  [NodeKind.Lattice]: 1.5 * CELL,
  [NodeKind.Camp]: 3 * CELL,
  [NodeKind.Peak]: 2 * CELL,
  [NodeKind.Opening]: CELL,
  [NodeKind.Stub]: 0,
  [NodeKind.Entrance]: 3 * CELL,
};
const STUB_LENGTH = 40;
const MAX_REACH = REACH[NodeKind.Camp];
const MAX_LATTICE_LINKS = 3;
const ROUTE_MARGIN = 32;
const WAY_MARGIN = 8;
const WOBBLE_SCALE = 48;
const TYPICAL_UNIT_COST = 2;
const NEAR_CELLS = Math.ceil((MAX_REACH + ROUTE_MARGIN + WAY_MARGIN) / CELL);
const cellsReachedFrom = (kind: NodeKind) => Math.ceil((REACH[kind] + ROUTE_MARGIN + WAY_MARGIN) / CELL);
const CACHE = 1 << 14;

const nodeKey = ({ x, y }: Point) => `${x},${y}`;
const cellKey = ({ col, row }: Cell) => `${col},${row}`;
const cellOf = (p: Point): Cell => ({ col: floorDiv(p.x, CELL), row: floorDiv(p.y, CELL) });
const regionOfCell = ({ col, row }: Cell): Region => ({
  rx: floorDiv(col, CELLS_PER_REGION),
  ry: floorDiv(row, CELLS_PER_REGION),
});
const isInCell = (p: Point, cell: Cell) => {
  const { col, row } = cellOf(p);
  return col === cell.col && row === cell.row;
};

const cellsAround = ({ col, row }: Cell, ring: number): Cell[] => {
  const side = 2 * ring + 1;
  return Array.from({ length: side * side }, (_, i) => ({
    col: col - ring + (i % side),
    row: row - ring + Math.floor(i / side),
  }));
};

const cellsOfRegion = ({ rx, ry }: Region, ring: number): Cell[] => {
  const side = CELLS_PER_REGION + 2 * ring;
  return Array.from({ length: side * side }, (_, i) => ({
    col: rx * CELLS_PER_REGION - ring + (i % side),
    row: ry * CELLS_PER_REGION - ring + Math.floor(i / side),
  }));
};

const headingOf = ({ inside, outside }: Opening): Point => {
  const length = distance(inside, outside);
  return { x: (outside.x - inside.x) / length, y: (outside.y - inside.y) / length };
};

export const createWayness =
  ({ fields, campAt }: WaynessInput) =>
  (p: Point): number => {
    const camps = regionsAround(regionOfCell(cellOf(p)), 1).flatMap((r) => campAt(r) ?? []);
    const pull = Math.max(0, ...camps.map((camp) => 1 - distance(camp, p) / CAMP_PULL_RANGE));
    return BIOME_WAYNESS[biomeOf(fields.conditions(p.x, p.y))] + CAMP_PULL * pull;
  };

export const createWays = ({ seed, fields, campAt, peakOf, openingsIn, entrancesIn }: WaySiting) => {
  const wobble = createNoise(seed, SALT);
  const level = (p: Point) => heightLevel(fields.elevation(p.x, p.y));
  const trailLevel = (p: Point) => heightLevel(fields.elevationBeforeLedges(p.x, p.y));
  const isDry = (p: Point) => level(p) > SEA_LEVEL;
  const waynessAt = createWayness({ fields, campAt });

  const nodesIn = memoize(
    (cell: Cell): WayNode[] => {
      const region = regionOfCell(cell);
      const anchors = (
        [
          [campAt(region), NodeKind.Camp],
          [peakOf(region), NodeKind.Peak],
        ] as const
      ).flatMap(([p, kind]) =>
        p && isInCell(p, cell)
          ? [{ x: p.x, y: p.y, key: nodeKey(p), kind, wayness: kind === NodeKind.Camp ? 1 : 0 }]
          : [],
      );
      const p = {
        x: cell.col * CELL + intBetween(NODE_MARGIN, CELL - NODE_MARGIN, hash(seed, SALT, cell.col, cell.row, 1)),
        y: cell.row * CELL + intBetween(NODE_MARGIN, CELL - NODE_MARGIN, hash(seed, SALT, cell.col, cell.row, 2)),
      };
      const wayness = isDry(p) ? waynessAt(p) : 0;
      const isLattice = unit(hash(seed, SALT, cell.col, cell.row, 3)) < wayness;
      return isLattice ? [...anchors, { ...p, key: nodeKey(p), kind: NodeKind.Lattice, wayness }] : anchors;
    },
    cellKey,
    CACHE,
  );

  const nodesWithin = (p: Point, radius: number) =>
    cellsAround(cellOf(p), Math.ceil(radius / CELL))
      .flatMap(nodesIn)
      .filter((n) => n.key !== nodeKey(p) && distance(n, p) <= radius);

  const picksOf = memoize(
    (node: WayNode): WayNode[] => {
      const neighbours = relativeNeighbours(node, nodesWithin(node, REACH[node.kind])).sort(
        (a, b) => distance(node, a) - distance(node, b),
      );
      if (node.kind !== NodeKind.Lattice) return neighbours;
      return neighbours.slice(0, countBiasedLow(MAX_LATTICE_LINKS, hash(seed, SALT, node.x, node.y)));
    },
    (node) => node.key,
    CACHE,
  );

  const picks = (from: WayNode, to: WayNode) => picksOf(from).some((n) => n.key === to.key);

  const linkedTo = memoize(
    (node: WayNode): WayNode[] => {
      const picked = picksOf(node);
      const pickedBy = nodesWithin(node, MAX_REACH).filter((n) => picks(n, node) && !picks(node, n));
      return [...picked, ...pickedBy];
    },
    (node) => node.key,
    CACHE,
  );

  const isDeadEnd = (node: WayNode) =>
    node.kind === NodeKind.Stub || (node.kind === NodeKind.Lattice && linkedTo(node).length === 1);

  const stubOf = (opening: WayNode): WayNode => {
    const end = {
      x: Math.round(opening.x + opening.heading!.x * STUB_LENGTH),
      y: Math.round(opening.y + opening.heading!.y * STUB_LENGTH),
    };
    return { ...end, key: nodeKey(end), kind: NodeKind.Stub, wayness: 0 };
  };

  const linkOf = memoize(
    ([from, to]: readonly [WayNode, WayNode]): WayLink | undefined => {
      const isRoad =
        [from.kind, to.kind].some((kind) => kind === NodeKind.Camp || kind === NodeKind.Entrance) ||
        Math.min(from.wayness, to.wayness) >= ROAD_WAYNESS;
      const nodes = route(from, to, {
        gradeLevel: isRoad ? level : trailLevel,
        isOpen: isDry,
        unitCost: (grade, at) => 1 + 0.6 * (1 + wobble(at.x / WOBBLE_SCALE, at.y / WOBBLE_SCALE)) + climbCost(grade),
        typicalUnitCost: TYPICAL_UNIT_COST,
        margin: ROUTE_MARGIN,
      });
      if (!nodes) return undefined;
      return {
        nodes: [from, ...nodes.slice(1, -1), to],
        way: isRoad ? Way.Road : Way.Path,
        fades: [from, to].filter(isDeadEnd),
      };
    },
    ([from, to]) => `${from.key}-${to.key}`,
    CACHE,
  );

  const ownedLinks = (node: WayNode) =>
    picksOf(node)
      .filter((other) => !picks(other, node) || node.key < other.key)
      .map((other) => [node, other] as const);

  const openingNodesOf = (openingsOf: (region: Region) => readonly Opening[], kind: NodeKind) => {
    const nodesInCell = memoize(
      (cell: Cell): WayNode[] =>
        regionsAround(regionOfCell(cell), 1)
          .flatMap(openingsOf)
          .filter(({ outside }) => isInCell(outside, cell))
          .map((opening) => ({
            ...opening.outside,
            key: nodeKey(opening.outside),
            kind,
            wayness: 0,
            heading: headingOf(opening),
          })),
      cellKey,
      CACHE,
    );
    return (region: Region) => cellsOfRegion(region, cellsReachedFrom(kind)).flatMap(nodesInCell);
  };
  const openingNodesNear = [
    openingNodesOf(openingsIn, NodeKind.Opening),
    openingNodesOf(entrancesIn, NodeKind.Entrance),
  ];

  const attachmentOf = (opening: WayNode): readonly [WayNode, WayNode] => {
    const [nearest] = nodesWithin(opening, REACH[opening.kind])
      .filter((node) => !isDeadEnd(node))
      .sort((a, b) => distance(opening, a) - distance(opening, b));
    return [opening, nearest ?? stubOf(opening)];
  };

  const near = memoize(
    (region: Region): WayLink[] => {
      const bounds = regionBounds(region);
      return [
        ...cellsOfRegion(region, NEAR_CELLS).flatMap(nodesIn).flatMap(ownedLinks),
        ...openingNodesNear.flatMap((nodesNear) => nodesNear(region)).map(attachmentOf),
      ]
        .filter((pair) => overlaps(boundsOf(pair, ROUTE_MARGIN + WAY_MARGIN), bounds))
        .flatMap((pair) => linkOf(pair) ?? [])
        .filter((link) => overlaps(boundsOf(link.nodes, WAY_MARGIN), bounds));
    },
    regionKey,
    CACHE,
  );

  return { near };
};
