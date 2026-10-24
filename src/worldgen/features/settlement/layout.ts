import { type Bounds, type Rng, type Vec2, atan2, byPosition, cos, distance, projectOntoSegment, sin } from "procgen";
import { Cover, Way } from "../../terrain";
import { WAY_SHAPES, type WayLink } from "../../ways";
import type { Anchor } from "../feature";
import { type Building, boundsOfBuilding, footprintOf, frameOf } from "../building/building";
import { BuildingKind, type Plan, planBuilding } from "../building/plan";

export const Tier = { Hamlet: 0, Village: 1, Town: 2 } as const;
export type Tier = (typeof Tier)[keyof typeof Tier];

type Range = readonly [min: number, max: number];

interface TierTraits {
  readonly radius: number;
  readonly buildings: Range;
  readonly square: number;
  readonly lanes: Range;
  readonly landmarks: readonly BuildingKind[];
  readonly fill: readonly (readonly [kind: BuildingKind, weight: number])[];
  readonly outskirts: readonly (readonly [kind: BuildingKind, weight: number])[];
  readonly roof: Cover;
}

export const TIERS: Record<Tier, TierTraits> = {
  [Tier.Hamlet]: {
    radius: 36,
    buildings: [3, 6],
    square: 4,
    lanes: [0, 0],
    landmarks: [],
    fill: [[BuildingKind.Cottage, 1]],
    outskirts: [
      [BuildingKind.Cottage, 2],
      [BuildingKind.Barn, 1],
    ],
    roof: Cover.Thatch,
  },
  [Tier.Village]: {
    radius: 60,
    buildings: [10, 18],
    square: 7,
    lanes: [1, 2],
    landmarks: [BuildingKind.Chapel, BuildingKind.Inn, BuildingKind.Smithy],
    fill: [
      [BuildingKind.Cottage, 3],
      [BuildingKind.House, 3],
      [BuildingKind.Shop, 1],
    ],
    outskirts: [
      [BuildingKind.Cottage, 3],
      [BuildingKind.Barn, 1],
    ],
    roof: Cover.Thatch,
  },
  [Tier.Town]: {
    radius: 96,
    buildings: [26, 44],
    square: 11,
    lanes: [3, 5],
    landmarks: [BuildingKind.Church, BuildingKind.Hall, BuildingKind.Inn, BuildingKind.Inn, BuildingKind.Smithy],
    fill: [
      [BuildingKind.House, 4],
      [BuildingKind.Shop, 2],
      [BuildingKind.Cottage, 1],
    ],
    outskirts: [
      [BuildingKind.Cottage, 2],
      [BuildingKind.House, 1],
      [BuildingKind.Barn, 1],
    ],
    roof: Cover.Slate,
  },
};

export const MAX_SETTLEMENT_RADIUS = TIERS[Tier.Town].radius;

export interface Settlement extends Anchor {
  readonly tier: Tier;
}

export type Street = Pick<WayLink, "nodes" | "way">;

export interface SettlementGround {
  readonly isBuildable: (p: Vec2) => boolean;
  readonly level: (p: Vec2) => number;
}

export interface Square {
  readonly radius: number;
  readonly level: number;
  readonly well: Vec2 | undefined;
}

export interface SettlementLayout {
  readonly settlement: Settlement;
  readonly radius: number;
  readonly square: Square;
  readonly lanes: readonly Street[];
  readonly buildings: readonly Building[];
}

const Use = { Free: 0, Square: 1, Verge: 2, Street: 3, Path: 4, Gap: 5, Building: 6 } as const;
type Use = (typeof Use)[keyof typeof Use];

const VERGE = 1.5;
const SLOT_STEP = 2;
const SETBACKS: Range = [1, 3];
const MAX_PATH = 6;
const MAX_UNEVENNESS = 4;
const OUTSKIRTS = 0.6;
const THINNING = 0.35;
const LANE_STEP = 4;
const LANE_WOBBLE = 1.5;
const MIN_LANE = 16;
const LANE_REACH = 0.85;
const LANE_SPREAD = (5 * Math.PI) / 18;
const COMPASS = 8;
const MIN_WELL_SQUARE = 7;
const WELL_CLEARANCE = 2;

const CARDINALS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const nearestCardinal = (d: Vec2): Vec2 =>
  CARDINALS.reduce((best, c) => (c.x * d.x + c.y * d.y > best.x * d.x + best.y * d.y ? c : best));

const tileOf = (p: Vec2): Vec2 => ({ x: Math.floor(p.x), y: Math.floor(p.y) });
const centreOf = (p: Vec2): Vec2 => ({ x: p.x + 0.5, y: p.y + 0.5 });
const step = (p: Vec2, d: Vec2): Vec2 => ({ x: p.x + d.x, y: p.y + d.y });

const ringOf = (bounds: Bounds): Vec2[] => {
  const ring: Vec2[] = [];
  for (let x = bounds.minX - 1; x <= bounds.maxX + 1; x++)
    ring.push({ x, y: bounds.minY - 1 }, { x, y: bounds.maxY + 1 });
  for (let y = bounds.minY; y <= bounds.maxY; y++) ring.push({ x: bounds.minX - 1, y }, { x: bounds.maxX + 1, y });
  return ring;
};

const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]!;

const angleGap = (a: number, b: number) => {
  const gap = Math.abs(a - b) % (2 * Math.PI);
  return Math.min(gap, 2 * Math.PI - gap);
};

const createUses = (centre: Vec2, radius: number) => {
  const origin = { x: centre.x - radius - 1, y: centre.y - radius - 1 };
  const side = 2 * radius + 3;
  const uses = new Uint8Array(side * side);
  const indexOf = ({ x, y }: Vec2) => {
    const [i, j] = [x - origin.x, y - origin.y];
    return i >= 0 && j >= 0 && i < side && j < side ? j * side + i : -1;
  };
  return {
    at: (p: Vec2): Use => {
      const i = indexOf(p);
      return i < 0 ? Use.Building : (uses[i] as Use);
    },
    mark: (p: Vec2, use: Use) => {
      const i = indexOf(p);
      if (i >= 0 && uses[i]! < use) uses[i] = use;
    },
  };
};

type Uses = ReturnType<typeof createUses>;

const markStreet = (uses: Uses, { nodes, way }: Street) => {
  const { halfWidth } = WAY_SHAPES[way];
  nodes.slice(1).forEach((b, i) => {
    const a = nodes[i]!;
    const reach = halfWidth + VERGE;
    for (let x = Math.floor(Math.min(a.x, b.x) - reach); x <= Math.ceil(Math.max(a.x, b.x) + reach); x++)
      for (let y = Math.floor(Math.min(a.y, b.y) - reach); y <= Math.ceil(Math.max(a.y, b.y) + reach); y++) {
        const gap = projectOntoSegment(centreOf({ x, y }), a, b).distance - halfWidth;
        if (gap <= 0) uses.mark({ x, y }, Use.Street);
        else if (gap <= VERGE) uses.mark({ x, y }, Use.Verge);
      }
  });
};

const headingsAway = (settlement: Settlement, { nodes }: Street, radius: number): number[] =>
  nodes.slice(1).flatMap((b, i) => {
    const a = nodes[i]!;
    const [inA, inB] = [distance(a, settlement) < radius, distance(b, settlement) < radius];
    if (inA === inB) return [];
    const out = inA ? b : a;
    return [atan2(out.y - settlement.y, out.x - settlement.x)];
  });

const layLanes = (
  settlement: Settlement,
  streets: readonly Street[],
  ground: SettlementGround,
  traits: TierTraits,
  rng: Rng,
) => {
  const { radius, square } = traits;
  const taken = streets.flatMap((street) => headingsAway(settlement, street, square + LANE_STEP));
  const wanted = rng.int(...traits.lanes, 0);
  const turn = rng.unit(1) * ((2 * Math.PI) / COMPASS);
  const headings = rng
    .shuffle(
      Array.from({ length: COMPASS }, (_, i) => turn + (i * 2 * Math.PI) / COMPASS),
      2,
    )
    .reduce<number[]>((chosen, heading) => {
      const isClear = [...taken, ...chosen].every((other) => angleGap(heading, other) >= LANE_SPREAD);
      return chosen.length < wanted && isClear ? [...chosen, heading] : chosen;
    }, []);
  const wobbles = rng.child("lane wobble");
  return headings.flatMap((heading, lane): Street[] => {
    const [dx, dy] = [cos(heading), sin(heading)];
    const nodes: Vec2[] = [{ x: settlement.x, y: settlement.y }];
    for (let along = square; along <= radius * LANE_REACH; along += LANE_STEP) {
      const wobble = (wobbles.unit(lane, along) * 2 - 1) * LANE_WOBBLE;
      const p = {
        x: Math.round(settlement.x + dx * along - dy * wobble),
        y: Math.round(settlement.y + dy * along + dx * wobble),
      };
      if (!ground.isBuildable(p)) break;
      nodes.push(p);
    }
    return distance(nodes.at(-1)!, settlement) >= MIN_LANE ? [{ nodes, way: Way.Road }] : [];
  });
};

interface Slot {
  readonly at: Vec2;
  readonly normal: Vec2;
  readonly halfWidth: number;
  readonly key: number;
}

const slotsAlong = (settlement: Settlement, streets: readonly Street[], traits: TierTraits): Slot[] =>
  streets
    .flatMap(({ nodes, way }, s) =>
      nodes.slice(1).flatMap((b, i) => {
        const a = nodes[i]!;
        const length = distance(a, b);
        if (length === 0) return [];
        const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
        return Array.from({ length: Math.ceil(length / SLOT_STEP) }, (_, k) => {
          const at = { x: a.x + tangent.x * k * SLOT_STEP, y: a.y + tangent.y * k * SLOT_STEP };
          return [1, -1].map((side) => ({
            at,
            normal: { x: -tangent.y * side, y: tangent.x * side },
            halfWidth: WAY_SHAPES[way].halfWidth,
            key: ((s * 4096 + i) * 64 + k) * 2 + (side > 0 ? 0 : 1),
          }));
        }).flat();
      }),
    )
    .filter(({ at }) => {
      const gap = distance(at, settlement);
      return gap >= traits.square + 2 && gap <= traits.radius - 4;
    })
    .sort((a, b) => distance(a.at, settlement) - distance(b.at, settlement) || byPosition(a.at, b.at) || a.key - b.key);

const CAN_PAVE: ReadonlySet<Use> = new Set([Use.Free, Use.Verge, Use.Square, Use.Path]);

const site = (
  slot: Slot,
  plan: Plan,
  settlement: Settlement,
  traits: TierTraits,
  uses: Uses,
  ground: SettlementGround,
  rng: Rng,
): Building | undefined => {
  for (let setback = rng.int(...SETBACKS, slot.key); setback <= MAX_PATH; setback++) {
    const building = siteBackFrom(slot, setback, plan, settlement, traits, uses, ground);
    if (building) return building;
  }
  return undefined;
};

const siteBackFrom = (
  slot: Slot,
  setback: number,
  plan: Plan,
  settlement: Settlement,
  { radius, roof }: TierTraits,
  uses: Uses,
  ground: SettlementGround,
): Building | undefined => {
  const facing = nearestCardinal({ x: -slot.normal.x, y: -slot.normal.y });
  const door = tileOf({
    x: slot.at.x + slot.normal.x * (slot.halfWidth + setback),
    y: slot.at.y + slot.normal.y * (slot.halfWidth + setback),
  });
  const frame = frameOf({ plan, door, facing });
  const footprint = footprintOf({ plan, frame });
  const bounds = boundsOfBuilding({ plan, frame });
  const fits = footprint.every(
    (p) => uses.at(p) === Use.Free && distance(centreOf(p), settlement) <= radius && ground.isBuildable(p),
  );
  if (!fits || ringOf(bounds).some((p) => uses.at(p) >= Use.Gap)) return undefined;
  const path: Vec2[] = [];
  for (let p = step(door, facing); uses.at(p) !== Use.Street; p = step(p, facing)) {
    if (path.length >= MAX_PATH || !CAN_PAVE.has(uses.at(p))) return undefined;
    path.push(p);
  }
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY },
    door,
  ].map(ground.level);
  if (Math.max(...corners) - Math.min(...corners) > MAX_UNEVENNESS) return undefined;
  return { plan, frame, level: median(corners), bounds, door, path, roof };
};

const occupy = (building: Building, uses: Uses) => {
  for (const p of footprintOf(building)) uses.mark(p, Use.Building);
  for (const p of ringOf(building.bounds)) uses.mark(p, Use.Gap);
  for (const p of building.path) uses.mark(p, Use.Path);
};

const squareOf = (settlement: Settlement, { square }: TierTraits, ground: SettlementGround, uses: Uses): Square => {
  const ring = Array.from({ length: 16 }, (_, i) => ({
    x: Math.round(settlement.x + cos((i * Math.PI) / 8) * square),
    y: Math.round(settlement.y + sin((i * Math.PI) / 8) * square),
  }));
  const tiles: Vec2[] = [];
  for (let x = settlement.x - square; x <= settlement.x + square; x++)
    for (let y = settlement.y - square; y <= settlement.y + square; y++)
      if (distance(centreOf({ x, y }), centreOf(settlement)) <= square) {
        uses.mark({ x, y }, Use.Square);
        tiles.push({ x, y });
      }
  const fromCentre = (p: Vec2) => distance(p, settlement);
  const well =
    square < MIN_WELL_SQUARE
      ? undefined
      : tiles
          .filter((p) => fromCentre(p) >= WELL_CLEARANCE && fromCentre(p) <= square - WELL_CLEARANCE)
          .filter((p) => uses.at(p) === Use.Square)
          .sort((a, b) => fromCentre(a) - fromCentre(b) || byPosition(a, b))[0];
  return { radius: square, level: median(ring.map(ground.level)), well };
};

export const layOutSettlement = (
  settlement: Settlement,
  roads: readonly Street[],
  ground: SettlementGround,
  rng: Rng,
): SettlementLayout => {
  const traits = TIERS[settlement.tier];
  const uses = createUses(settlement, traits.radius);
  const lanes = layLanes(settlement, roads, ground, traits, rng);
  const streets = [...roads, ...lanes];
  for (const street of streets) markStreet(uses, street);
  const square = squareOf(settlement, traits, ground, uses);

  const target = rng.int(...traits.buildings, 3);
  const pending = traits.landmarks.map((kind, i) => planBuilding(kind, rng.child("landmark", i)));
  const [thinning, kinds, setbacks] = [rng.child("thinning"), rng.child("kinds"), rng.child("setbacks")];
  const buildings: Building[] = [];
  for (const slot of slotsAlong(settlement, streets, traits)) {
    if (buildings.length >= target) break;
    const reach = distance(slot.at, settlement) / traits.radius;
    if (pending.length === 0 && thinning.chance(THINNING * reach, slot.key)) continue;
    const mix = reach > OUTSKIRTS ? traits.outskirts : traits.fill;
    const fill = planBuilding(kinds.weighted(mix, slot.key), rng.child("fill", slot.key));
    for (const plan of [...pending, fill]) {
      const building = site(slot, plan, settlement, traits, uses, ground, setbacks);
      if (!building) continue;
      occupy(building, uses);
      buildings.push(building);
      const landmark = pending.indexOf(plan);
      if (landmark >= 0) pending.splice(landmark, 1);
      break;
    }
  }
  return { settlement, radius: traits.radius, square, lanes, buildings };
};
