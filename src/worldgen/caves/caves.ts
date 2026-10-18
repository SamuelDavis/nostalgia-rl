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
import { RAMP_LINK, createCavePlans } from "./plan";
import { type Cave, TERRITORY_RADIUS, createCaveSiting } from "./siting";

export interface CavesInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly peakOf: (region: Region) => Peak | undefined;
}

const CACHE = 4096;
const MOUTH_PRIORITY = 2;

const isAt = (a: Point, b: Point | undefined) => b !== undefined && a.x === b.x && a.y === b.y;

export const createCaves = ({ seed, fields, peakOf }: CavesInput) => {
  const siting = createCaveSiting({ seed, fields, peakOf });
  const plans = createCavePlans({ seed, fields, caveOwning: siting.caveOwning });
  const { junctionsOf } = createJunctions({ seed, fields, siting, plans });
  const floors = createCaveFloors({ seed, fields, caveOwning: siting.caveOwning, plans, junctionsOf });

  const caveAt = (anchor: Point) => siting.cavesIn(regionOf(anchor)).find((cave) => isAt(cave, anchor));

  const openingsIn = memoize(
    (region: Region): Opening[] =>
      siting.cavesIn(region).map((cave) => {
        const { inside, outside } = plans.planOf(cave).mouth;
        return { inside, outside };
      }),
    regionKey,
    CACHE,
  );

  const floorOf = (layer: CaveFloor) => {
    const cave = caveAt(layer.cave);
    if (!cave) return undefined;
    const { top, bottom } = plans.planOf(cave);
    return layer.floor <= top && layer.floor >= bottom ? floors.floorOf(cave, layer.floor) : undefined;
  };

  const linkAcross = (layer: Layer, from: Point, to: Point): Layer | undefined => {
    if (layer === SURFACE) {
      const cave = regionsAround(regionOf(from), 1)
        .flatMap(siting.cavesIn)
        .find((c) => {
          const { mouth } = plans.planOf(c);
          return isAt(from, mouth.outside) && isAt(to, mouth.inside);
        });
      return cave && { cave, floor: 0 };
    }
    const cave = caveAt(layer.cave);
    if (!cave) return undefined;
    const { mouth, top, bottom } = plans.planOf(cave);
    const { floor } = layer;
    if (floor === 0 && isAt(from, mouth.inside) && isAt(to, mouth.outside)) return SURFACE;
    const below = floor > bottom ? plans.rampBelow(cave, floor) : undefined;
    if (below && isAt(from, below.tiles[RAMP_LINK - 1]) && isAt(to, below.tiles[RAMP_LINK]))
      return { cave, floor: floor - 1 };
    const above = floor < top ? plans.rampBelow(cave, floor + 1) : undefined;
    if (above && isAt(from, above.tiles[RAMP_LINK]) && isAt(to, above.tiles[RAMP_LINK - 1]))
      return { cave, floor: floor + 1 };
    return junctionsOf(cave).find((j) => j.floor === floor && isAt(from, j.tiles[0]) && isAt(to, j.across))?.other;
  };

  const type: FeatureType<Cave, Opening> = {
    name: "cave mouth",
    priority: MOUTH_PRIORITY,
    reach: TERRITORY_RADIUS,
    bounds: (cave) => {
      const { inside, outside } = plans.planOf(cave).mouth;
      return boundsOf([inside, outside], 1);
    },
    build: (cave) => plans.planOf(cave).mouth,
    paint: ({ inside, outside }, draft, x, y) => {
      const p = { x, y };
      if (!isAt(p, inside) && !isAt(p, outside)) return false;
      draft.prop = isAt(p, inside) ? Prop.CaveMouth : Prop.None;
      draft.way = Way.None;
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
    floorOf,
    linkAcross,
  };
};

export type { Cave };
