import { type Point, distance, hash, hashString, memoize } from "../../lib";
import { type FeatureType, settle } from "../features/feature";
import { type PlacedProp, footprintOf, partOf, tilesOf } from "../props";
import { type Region, boundsOf, regionOf, regionsAround } from "../region";
import { Cover, Ground, Prop, Water } from "../terrain";
import { type WayLink, isOnWay } from "../ways";
import type { CavePlan, Mouth } from "./plan";
import { type Cave, TERRITORY_RADIUS } from "./siting";

export interface Heap extends Point {
  readonly radius: number;
}

export interface MineYard {
  readonly mouth: Mouth;
  readonly floors: number;
  readonly isWild: boolean;
  readonly half: number;
  readonly depth: number;
  readonly heap: Heap;
  readonly props: readonly PlacedProp[];
}

export interface MineYardInput {
  readonly seed: number;
  readonly planOf: (cave: Cave) => CavePlan;
  readonly waynessAt: (p: Point) => number;
  readonly waysNear: (region: Region) => readonly WayLink[];
}

export const BIG_MINE_FLOORS = 12;
export const WILD_WAYNESS = 0.4;
const SALT = hashString("mine yards");
const PRIORITY = 2;
const ROAD_HALF = 1;
const FIRST_COLUMN = ROAD_HALF + 2;
const MIN_HALF = 4;
const MIN_DEPTH = 6;
const SEAM = 8;
const HEAP_RADIUS = 3;
const HEAP_RADIUS_PER_FLOOR = 0.5;
const HEAP_RISE = 1;
const YARD_REACH = 48;
const CACHE = 1024;

const outwardOf = ({ inside, outside }: Mouth): Point => ({ x: outside.x - inside.x, y: outside.y - inside.y });
const lateralOf = (outward: Point): Point => ({ x: -outward.y, y: outward.x });

const worldAt = (mouth: Mouth, u: number, v: number): Point => {
  const [outward, lateral] = [outwardOf(mouth), lateralOf(outwardOf(mouth))];
  return { x: mouth.inside.x + lateral.x * u + outward.x * v, y: mouth.inside.y + lateral.y * u + outward.y * v };
};

const localOf = (mouth: Mouth, p: Point) => {
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

export const createMineYards = ({ seed, planOf, waynessAt, waysNear }: MineYardInput) => {
  const yardOf = memoize(
    (cave: Cave): MineYard => {
      const { mouth, mine } = planOf(cave);
      const floors = mine ? mine.top - mine.bottom + 1 : 0;
      const isWild = waynessAt(mouth.outside) < WILD_WAYNESS;
      const links = regionsAround(regionOf(mouth.outside), 1).flatMap(waysNear);
      const layOut = (side: number) => {
        const columns = [
          columnOf(floors >= BIG_MINE_FLOORS ? [Prop.Stockpile, Prop.Shed] : [], side, mouth),
          columnOf(isWild ? [Prop.Bunkhouse, Prop.Campfire] : [], -side, mouth),
        ].flat();
        const props = columns.map(({ prop }) => prop).filter((prop) => !tilesOf(prop).some((p) => isOnWay(links, p)));
        return { side, columns, props };
      };
      const preferred = hash(seed, SALT, cave.id) % 2 === 0 ? 1 : -1;
      const { side, columns, props } = [layOut(preferred), layOut(-preferred)].reduce((a, b) =>
        b.props.length > a.props.length ? b : a,
      );
      const half = Math.max(MIN_HALF, ...columns.map(({ extent }) => FIRST_COLUMN + extent.u));
      const depth = Math.max(MIN_DEPTH, ...columns.map(({ end }) => end + 1));
      const radius = HEAP_RADIUS + floors * HEAP_RADIUS_PER_FLOOR;
      return {
        mouth,
        floors,
        isWild,
        half,
        depth,
        heap: { ...worldAt(mouth, -side * half, depth + Math.ceil(radius)), radius },
        props,
      };
    },
    (cave) => String(cave.id),
    CACHE,
  );

  const type: FeatureType<Cave, MineYard> = {
    name: "mine yard",
    priority: PRIORITY,
    reach: TERRITORY_RADIUS + YARD_REACH,
    bounds: (cave) => {
      const { mouth, half, depth, heap } = yardOf(cave);
      const r = heap.radius;
      return boundsOf(
        [
          worldAt(mouth, -half, 1),
          worldAt(mouth, half, depth),
          { x: heap.x - r, y: heap.y - r },
          { x: heap.x + r, y: heap.y + r },
        ],
        SEAM,
      );
    },
    build: yardOf,
    paint: ({ mouth, half, depth, heap, props }, draft, x, y) => {
      const p = { x, y };
      const { u, v } = localOf(mouth, p);
      if (v < 1) return false;
      const gap = distance({ x: Math.max(0, Math.abs(u) - half), y: Math.max(0, v - depth) }, { x: 0, y: 0 });
      const isHeap = gap > 0 && distance(p, heap) < heap.radius;
      if (gap > SEAM && !isHeap) return false;
      if (gap <= SEAM) draft.height = settle(draft.height, mouth.level, gap);
      if (gap > 0 && !isHeap) return false;
      draft.water = Water.None;
      draft.cover = Cover.None;
      if (isHeap) {
        draft.height += Math.round(HEAP_RISE * (heap.radius - distance(p, heap)));
        draft.ground = Ground.Spoil;
        draft.prop = Prop.None;
        draft.part = 0;
        return true;
      }
      const prop = props.find((placed) => partOf(placed, p) !== undefined);
      draft.ground = Ground.Dirt;
      draft.prop = prop?.kind ?? Prop.None;
      draft.part = prop ? partOf(prop, p)! : 0;
      return true;
    },
  };

  return { type, yardOf };
};
