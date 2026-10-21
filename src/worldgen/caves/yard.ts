import { type FeatureType, type Stage, type Vec2, boundsOf, distance, rngOf } from "procgen";
import { type TileDraft, settle } from "../features/feature";
import { type PlacedProp, footprintOf, partOf, tilesOf } from "../props";
import { Cover, Ground, Prop, Water, Way } from "../terrain";
import { type WayLink, isOnWay } from "../ways";
import type { CavePlan, Mouth } from "./plan";
import { type Cave, TERRITORY_RADIUS } from "./siting";

export interface MineYard {
  readonly mouth: Mouth;
  readonly floors: number;
  readonly half: number;
  readonly depth: number;
  readonly props: readonly PlacedProp[];
}

export interface MineYardInput {
  readonly seed: number;
  readonly mines: Stage<readonly Cave[]>;
  readonly plans: Stage<readonly CavePlan[]>;
  readonly waysNear: Stage<readonly WayLink[]>;
}

export const MEDIUM_MINE_FLOORS = 8;
export const BIG_MINE_FLOORS = 12;
const PRIORITY = 2;
const ROAD_HALF = 1;
const FIRST_COLUMN = ROAD_HALF + 2;
const MIN_HALF = 3;
const MIN_DEPTH = 3;
const SEAM = 8;
const YARD_REACH = 32;

const outwardOf = ({ inside, outside }: Mouth): Vec2 => ({ x: outside.x - inside.x, y: outside.y - inside.y });
const lateralOf = (outward: Vec2): Vec2 => ({ x: -outward.y, y: outward.x });

const worldAt = (mouth: Mouth, u: number, v: number): Vec2 => {
  const [outward, lateral] = [outwardOf(mouth), lateralOf(outwardOf(mouth))];
  return { x: mouth.inside.x + lateral.x * u + outward.x * v, y: mouth.inside.y + lateral.y * u + outward.y * v };
};

const localOf = (mouth: Mouth, p: Vec2) => {
  const [outward, lateral] = [outwardOf(mouth), lateralOf(outwardOf(mouth))];
  const d = { x: p.x - mouth.inside.x, y: p.y - mouth.inside.y };
  return { u: d.x * lateral.x + d.y * lateral.y, v: d.x * outward.x + d.y * outward.y };
};

const extentOf = (kind: Prop, mouth: Mouth) => {
  const { x, y } = footprintOf(kind);
  return outwardOf(mouth).x === 0 ? { u: x, v: y } : { u: y, v: x };
};

const columnOf = (kinds: readonly Prop[], side: number, mouth: Mouth) => {
  let v = 2;
  return kinds.map((kind) => {
    const extent = extentOf(kind, mouth);
    const u = side > 0 ? FIRST_COLUMN : -FIRST_COLUMN - extent.u + 1;
    const [a, b] = [worldAt(mouth, u, v), worldAt(mouth, u + extent.u - 1, v + extent.v - 1)];
    const placed = {
      prop: { kind, at: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) } },
      end: v + extent.v - 1,
      extent,
    };
    v += extent.v + 1;
    return placed;
  });
};

const columnsFor = (floors: number, hasTent: boolean): readonly (readonly Prop[])[] => {
  if (floors >= BIG_MINE_FLOORS)
    return [
      [Prop.Stockpile, Prop.Shed, Prop.Shed],
      [Prop.Bunkhouse, Prop.Campfire],
    ];
  if (floors >= MEDIUM_MINE_FLOORS) return [[Prop.Stockpile], [Prop.Tent, Prop.Campfire]];
  return [[Prop.Campfire], hasTent ? [Prop.Tent] : []];
};

export const createMineYards = ({
  seed,
  mines,
  plans,
  waysNear,
}: MineYardInput): FeatureType<Cave, MineYard, TileDraft> => {
  const rng = rngOf(seed, "mine yards");
  const yardOf = ({ mouth, mine, cave }: CavePlan, links: readonly WayLink[]): MineYard => {
    const floors = mine ? mine.top - mine.bottom + 1 : 0;
    const [near, far] = columnsFor(floors, rng.chance(0.5, cave.id, 1));
    const layOut = (side: number) => {
      const columns = [columnOf(near!, side, mouth), columnOf(far!, -side, mouth)].flat();
      const props = columns.map(({ prop }) => prop).filter((prop) => !tilesOf(prop).some((p) => isOnWay(links, p)));
      return { columns, props };
    };
    const preferred = rng.chance(0.5, cave.id, 0) ? 1 : -1;
    const { columns, props } = [layOut(preferred), layOut(-preferred)].reduce((a, b) =>
      b.props.length > a.props.length ? b : a,
    );
    const half = Math.max(MIN_HALF, ...columns.map(({ extent }) => FIRST_COLUMN + extent.u));
    const depth = Math.max(MIN_DEPTH, ...columns.map(({ end }) => end + 1));
    return { mouth, floors, half, depth, props };
  };

  return {
    name: "mine yard",
    priority: PRIORITY,
    sites: mines,
    reach: TERRITORY_RADIUS + YARD_REACH,
    reads: [
      { stage: plans, radius: 0 },
      { stage: waysNear, radius: TERRITORY_RADIUS + YARD_REACH },
    ],
    build: (cave, { read, gather }) => {
      const plan = read(plans, cave.region).find((p) => p.cave.id === cave.id)!;
      return yardOf(plan, [...new Set(gather(waysNear, boundsOf([plan.mouth.outside], YARD_REACH)))]);
    },
    bounds: ({ mouth, half, depth }) => boundsOf([worldAt(mouth, -half, 1), worldAt(mouth, half, depth)], SEAM),
    paint: ({ mouth, half, depth, props }, draft, x, y) => {
      const p = { x, y };
      const { u, v } = localOf(mouth, p);
      if (v < 1) return false;
      const gap = distance({ x: Math.max(0, Math.abs(u) - half), y: Math.max(0, v - depth) }, { x: 0, y: 0 });
      if (gap > SEAM) return false;
      draft.height = settle(draft.height, mouth.level, gap);
      if (gap > 0) return false;
      draft.water = Water.None;
      draft.cover = Cover.None;
      const prop = props.find((placed) => partOf(placed, p) !== undefined);
      draft.ground = Ground.Dirt;
      draft.prop = prop?.kind ?? Prop.None;
      draft.part = prop ? partOf(prop, p)! : 0;
      if (prop) draft.way = Way.None;
      return true;
    },
  };
};
