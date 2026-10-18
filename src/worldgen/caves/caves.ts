import { type Point, memoize } from "../../lib";
import type { Fields } from "../fields";
import type { Opening } from "../features/deep-forest";
import type { FeatureType } from "../features/feature";
import { boundsOf } from "../region";
import { Cover, Prop, Water, Way } from "../terrain";
import type { Peak } from "../landmarks";
import { type CaveFloor, type Layer, SURFACE } from "../layer";
import { type Region, regionKey, regionOf, regionsAround } from "../region";
import { createCaveFloors } from "./floor";
import { createJunctions } from "./junctions";
import { type Ramp, createCavePlans, isOnFloors } from "./plan";
import { type Cave, TERRITORY_RADIUS, createCaveSiting } from "./siting";

export interface CavesInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly peakOf: (region: Region) => Peak | undefined;
  readonly waynessAt: (p: Point) => number;
}

const CACHE = 4096;
const MOUTH_PRIORITY = 2;

const isAt = (a: Point, b: Point | undefined) => b !== undefined && a.x === b.x && a.y === b.y;

export const createCaves = ({ seed, fields, peakOf, waynessAt }: CavesInput) => {
  const siting = createCaveSiting({ seed, fields, peakOf });
  const plans = createCavePlans({ seed, fields, caveOwning: siting.caveOwning, waynessAt });
  const { junctionsOf } = createJunctions({ seed, fields, siting, plans });
  const floors = createCaveFloors({ seed, fields, caveOwning: siting.caveOwning, plans, junctionsOf });

  const caveAt = (anchor: Point) => siting.cavesIn(regionOf(anchor)).find((cave) => isAt(cave, anchor));

  const mouthsIn = memoize(
    (region: Region) =>
      siting.cavesIn(region).map((cave) => {
        const { mouth, isMine } = plans.mouthOf(cave);
        return { opening: { inside: mouth.inside, outside: mouth.outside }, isMine };
      }),
    regionKey,
    CACHE,
  );
  const openingsIn = (region: Region): Opening[] =>
    mouthsIn(region).flatMap(({ opening, isMine }) => (isMine ? [] : [opening]));
  const entrancesIn = (region: Region): Opening[] =>
    mouthsIn(region).flatMap(({ opening, isMine }) => (isMine ? [opening] : []));

  const floorOf = (layer: CaveFloor) => {
    const cave = caveAt(layer.cave);
    if (!cave) return undefined;
    const plan = plans.planOf(cave);
    return isOnFloors(plan.mine ?? plan, layer.floor) ? floors.floorOf(cave, layer.floor) : undefined;
  };

  const linkAcross = (layer: Layer, from: Point, to: Point): Layer | undefined => {
    if (layer === SURFACE) {
      const cave = regionsAround(regionOf(from), 1)
        .flatMap(siting.cavesIn)
        .find((c) => {
          const { mouth } = plans.mouthOf(c);
          return isAt(from, mouth.outside) && isAt(to, mouth.inside);
        });
      return cave && { cave, floor: 0 };
    }
    const cave = caveAt(layer.cave);
    if (!cave) return undefined;
    const plan = plans.planOf(cave);
    const { floor } = layer;
    if (floor === 0 && isAt(from, plan.mouth.inside) && isAt(to, plan.mouth.outside)) return SURFACE;
    const flightsBelow = (upper: number): Ramp[] =>
      [
        ...(isOnFloors(plan, upper) && isOnFloors(plan, upper - 1) ? [plans.rampBelow(cave, upper)] : []),
        floors.stairBelow(cave, upper),
      ].filter((ramp) => ramp !== undefined);
    const crosses = ({ tiles, link }: Ramp, down: boolean) =>
      isAt(from, tiles[down ? link - 1 : link]) && isAt(to, tiles[down ? link : link - 1]);
    if (flightsBelow(floor).some((ramp) => crosses(ramp, true))) return { cave, floor: floor - 1 };
    if (flightsBelow(floor + 1).some((ramp) => crosses(ramp, false))) return { cave, floor: floor + 1 };
    return junctionsOf(cave).find((j) => j.floor === floor && isAt(from, j.tiles[0]) && isAt(to, j.across))?.other;
  };

  const type: FeatureType<Cave, ReturnType<typeof plans.mouthOf>> = {
    name: "cave mouth",
    priority: MOUTH_PRIORITY,
    reach: TERRITORY_RADIUS,
    bounds: (cave) => {
      const { portal, outside } = plans.mouthOf(cave).mouth;
      return boundsOf([...portal, outside], 1);
    },
    build: (cave) => plans.mouthOf(cave),
    paint: ({ mouth, isMine }, draft, x, y) => {
      const p = { x, y };
      const isPortal = mouth.portal.some((t) => isAt(p, t));
      if (!isPortal && !isAt(p, mouth.outside)) return false;
      draft.prop = !isPortal ? Prop.None : isMine ? Prop.MineEntrance : Prop.CaveMouth;
      if (isPortal) draft.way = Way.None;
      draft.water = Water.None;
      draft.cover = Cover.None;
      return true;
    },
  };

  return {
    type,
    cavesIn: siting.cavesIn,
    planOf: plans.planOf,
    rampBelow: plans.rampBelow,
    junctionsOf,
    openingsIn,
    entrancesIn,
    floorOf,
    linkAcross,
  };
};

export type { Cave };
