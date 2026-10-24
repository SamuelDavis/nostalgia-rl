import { type Vec2, contains, distance, expand } from "procgen";
import { FOREST_THRESHOLD } from "../../biome";
import { metresToLevels } from "../../constants";
import { Biome, Cover, Ground, Prop, Water, Way } from "../../terrain";
import { DEEP_FORESTNESS } from "../deep-forest";
import { type Building, boundsOfBuilding, footprintOf, frameOf, paintBuilding } from "../building/building";
import { BuildingKind, planBuilding } from "../building/plan";
import { settle } from "../feature";
import { Good, Occupant, type Purpose, Role } from "../purpose";
import { type MinorDesign, gapFrom, isFlat, medianLevel, nearestCardinal, nearestWayPoint } from "./kind";

const RADIUS = 15;
const CLEARING = 8;
const DOOR_OFFSET = 2;
const WAY_RANGE = 90;
const EDGE = 0.15;
const SUPPLY_RANGE = 640;
const STUMP_SHARE = 0.25;
const TREE_SHARE = 0.7;
const PINE_SHARE = 0.4;
const FLATNESS = metresToLevels(3);
const LANDS: ReadonlySet<Biome> = new Set([Biome.Grassland, Biome.Forest]);

const step = (p: Vec2, d: Vec2, n: number): Vec2 => ({ x: p.x + d.x * n, y: p.y + d.y * n });

export const woodcutter: MinorDesign = {
  radius: RADIUS,
  fits: (p, land, { ways }) => {
    const { forestness } = land.conditions(p);
    if (!LANDS.has(land.biomeAt(p)) || forestness < FOREST_THRESHOLD - EDGE || forestness > DEEP_FORESTNESS - 0.1)
      return false;
    const way = nearestWayPoint(ways, p);
    return !!way && way.distance <= WAY_RANGE && isFlat(land, p, 5, FLATNESS);
  },
  build: (site, land, { ways, settlements }, rng) => {
    const facing = nearestCardinal(site, nearestWayPoint(ways, site)!.at);
    const plan = planBuilding(BuildingKind.Cottage, rng.child("hut"));
    const door = step(site, facing, DOOR_OFFSET);
    const frame = frameOf({ plan, door, facing });
    const bounds = boundsOfBuilding({ plan, frame });
    const corners = [...footprintOf({ plan, frame }), door];
    const level = medianLevel(land, corners);
    const path = Array.from({ length: RADIUS }, (_, i) => step(door, facing, i + 1)).filter(
      (p) => gapFrom(site, p.x, p.y) <= RADIUS,
    );
    const hut: Building = { plan, frame, level, bounds, door, path, roof: Cover.Thatch };
    const lateral = { x: -facing.y, y: facing.x };
    const piles = [-1, 1].map((side) => step(step(door, facing, 1), lateral, side * (Math.ceil(plan.width / 2) + 1)));
    const supplied = [...settlements].sort((a, b) => distance(a, site) - distance(b, site))[0];
    const purpose: Purpose = {
      role: Role.Worksite,
      occupants: [Occupant.Woodcutter],
      produces: [Good.Timber],
      ...(supplied && distance(supplied, site) <= SUPPLY_RANGE
        ? { relation: { kind: "supplies" as const, target: { x: supplied.x, y: supplied.y } } }
        : {}),
    };
    const isPath = (x: number, y: number) => path.some((p) => p.x === x && p.y === y);
    return {
      purpose,
      buildings: [hut],
      paint: (draft, x, y) => {
        const gap = gapFrom(site, x, y);
        if (gap > RADIUS) return false;
        const p = { x, y };
        if (contains(bounds, p)) {
          paintBuilding(hut, draft, p);
          return true;
        }
        draft.prop = Prop.None;
        draft.part = 0;
        if (isPath(x, y)) {
          draft.height = settle(draft.height, level, gap - CLEARING);
          draft.water = Water.None;
          draft.way = Way.Path;
          return true;
        }
        if (gap <= CLEARING) {
          draft.height = settle(draft.height, level, gap - CLEARING / 2);
          draft.water = Water.None;
          draft.ground = Ground.Dirt;
          if (piles.some((q) => q.x === x && q.y === y)) draft.prop = Prop.LogPile;
          else if (!contains(expand(bounds, 1), p) && rng.chance(STUMP_SHARE, x, y)) draft.prop = Prop.Stump;
          return true;
        }
        if (draft.water === Water.None && draft.way === Way.None && rng.chance(TREE_SHARE, x, y, 1))
          draft.prop = rng.chance(PINE_SHARE, x, y, 2) ? Prop.Pine : Prop.Oak;
        return true;
      },
    };
  },
};
