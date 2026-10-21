import {
  type Cell,
  type Dependency,
  type FeatureType,
  type Reader,
  type Stage,
  type Vec2,
  boundsOf,
  memoize,
  stage,
} from "procgen";
import type { Opening, TileDraft } from "../features/feature";
import type { Fields } from "../fields";
import { type CaveFloor, type Layer, SURFACE } from "../layer";
import type { Peak } from "../landmarks";
import { regions } from "../region";
import { Cover, Prop, Water, Way } from "../terrain";
import type { CaveMouth, WayLink } from "../ways";
import { type CaveSite, createCaveFloors } from "./floor";
import { createJunctions } from "./junctions";
import { type CavePlan, type Mouth, type Ramp, createCavePlans, isOnFloors } from "./plan";
import { type Cave, TERRITORY_RADIUS, createCaveSiting } from "./siting";
import { createMineYards } from "./yard";

export interface CavesInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly peaks: Stage<Peak | undefined>;
  readonly waynessAt: (reader: Reader, p: Vec2) => number;
  readonly waynessReads: readonly Dependency[];
}

interface MouthLayout {
  readonly mouth: Mouth;
  readonly isMine: boolean;
}

const MOUTH_PRIORITY = 3;
const NEIGHBOUR_REACH = 2 * TERRITORY_RADIUS + 48;
const SITE_CACHE = 128;

const isAt = (a: Vec2, b: Vec2 | undefined) => b !== undefined && a.x === b.x && a.y === b.y;

export const MOUTH_REACH = TERRITORY_RADIUS + 1;

export const createCaves = ({ seed, fields, peaks, waynessAt, waynessReads }: CavesInput) => {
  const siting = createCaveSiting({ seed, fields, peaks });
  const plans = createCavePlans({ seed, fields, siting, waynessAt, waynessReads });
  const junctions = createJunctions({ seed, fields, siting, plans });
  const floors = createCaveFloors({ seed, fields });

  const mouths = stage({
    name: "cave mouths",
    grid: regions,
    reads: [{ stage: plans, radius: 0 }],
    compute: (region, { read }): readonly CaveMouth[] =>
      read(plans, region).map(({ mouth, mine }) => ({
        opening: { inside: mouth.inside, outside: mouth.outside },
        isMine: mine !== undefined,
      })),
  });

  const mines = stage({
    name: "mines",
    grid: regions,
    reads: [{ stage: plans, radius: 0 }],
    compute: (region, { read }): readonly Cave[] =>
      read(plans, region).flatMap(({ cave, mine }) => (mine ? [cave] : [])),
  });

  const mouthFeature: FeatureType<Cave, MouthLayout, TileDraft> = {
    name: "cave mouth",
    priority: MOUTH_PRIORITY,
    sites: siting.caves,
    reach: TERRITORY_RADIUS,
    reads: [{ stage: plans, radius: 0 }],
    build: (cave, { read }) => {
      const { mouth, mine } = read(plans, cave.region).find((plan) => plan.cave.id === cave.id)!;
      return { mouth, isMine: mine !== undefined };
    },
    bounds: ({ mouth }) => boundsOf([mouth.inside, mouth.outside], 1),
    paint: ({ mouth, isMine }, draft, x, y) => {
      const p = { x, y };
      const isPortal = isAt(p, mouth.inside);
      if (!isPortal && !isAt(p, mouth.outside)) return false;
      draft.prop = !isPortal ? Prop.None : isMine ? Prop.MineEntrance : Prop.CaveMouth;
      draft.part = 0;
      if (isPortal) draft.way = Way.None;
      draft.water = Water.None;
      draft.cover = Cover.None;
      return true;
    },
  };

  const yardFeature = (waysNear: Stage<readonly WayLink[]>) => createMineYards({ seed, mines, plans, waysNear });

  const explore = (reader: Reader) => {
    const caveAt = (anchor: Vec2): Cave | undefined =>
      reader.readAt(siting.caves, anchor).find((cave) => isAt(cave, anchor));

    const siteOf = memoize(
      (cave: Cave): CaveSite => {
        const index = reader.read(siting.caves, cave.region).findIndex(({ id }) => id === cave.id);
        return {
          cave,
          plan: reader.read(plans, cave.region)[index]!,
          junctions: reader.read(junctions, cave.region)[index]!,
          neighbours: reader.gather(siting.caves, boundsOf([cave], NEIGHBOUR_REACH)).filter(({ id }) => id !== cave.id),
        };
      },
      (cave) => String(cave.id),
      SITE_CACHE,
    );

    const layerFloor = (layer: CaveFloor) => {
      const cave = caveAt(layer.cave);
      if (!cave) return undefined;
      const site = siteOf(cave);
      return isOnFloors(site.plan.mine ?? site.plan, layer.floor) ? floors.floorOf(site, layer.floor) : undefined;
    };
    const mouthsIn = (region: Cell, isMine: boolean): Opening[] =>
      reader.read(mouths, region).flatMap((mouth) => (mouth.isMine === isMine ? [mouth.opening] : []));

    const linkAcross = (layer: Layer, from: Vec2, to: Vec2): Layer | undefined => {
      if (layer === SURFACE) {
        const plan = reader
          .gather(plans, boundsOf([from], TERRITORY_RADIUS + 1))
          .find(({ mouth }) => isAt(from, mouth.outside) && isAt(to, mouth.inside));
        return plan && { cave: plan.cave, floor: 0 };
      }
      const cave = caveAt(layer.cave);
      if (!cave) return undefined;
      const site = siteOf(cave);
      const { plan } = site;
      const { floor } = layer;
      if (floor === 0 && isAt(from, plan.mouth.inside) && isAt(to, plan.mouth.outside)) return SURFACE;
      const flightsBelow = (upper: number): Ramp[] =>
        [
          ...(isOnFloors(plan, upper) && isOnFloors(plan, upper - 1) ? [plan.rampBelow(upper)] : []),
          floors.stairBelow(site, upper),
        ].filter((ramp) => ramp !== undefined);
      const crosses = ({ tiles, link }: Ramp, down: boolean) =>
        isAt(from, tiles[down ? link - 1 : link]) && isAt(to, tiles[down ? link : link - 1]);
      if (flightsBelow(floor).some((ramp) => crosses(ramp, true))) return { cave, floor: floor - 1 };
      if (flightsBelow(floor + 1).some((ramp) => crosses(ramp, false))) return { cave, floor: floor + 1 };
      return site.junctions.find((j) => j.floor === floor && isAt(from, j.tiles[0]) && isAt(to, j.across))?.other;
    };

    return {
      cavesIn: (region: Cell) => reader.read(siting.caves, region),
      candidateIn: (region: Cell) => reader.read(siting.candidates, region)[0],
      caveOwning: (p: Vec2) => siting.caveOwning(reader, p),
      planOf: (cave: Cave) => siteOf(cave).plan,
      rampBelow: (cave: Cave, floor: number) => siteOf(cave).plan.rampBelow(floor),
      junctionsOf: (cave: Cave) => siteOf(cave).junctions,
      floorOf: (cave: Cave, floor: number) => floors.floorOf(siteOf(cave), floor),
      stairBelow: (cave: Cave, floor: number) => floors.stairBelow(siteOf(cave), floor),
      openingsIn: (region: Cell) => mouthsIn(region, false),
      entrancesIn: (region: Cell) => mouthsIn(region, true),
      layerFloor,
      linkAcross,
    };
  };

  return { siting, plans, junctions, mouths, mines, mouthFeature, yardFeature, explore };
};

export type Caves = ReturnType<typeof createCaves>;
export type Explored = ReturnType<Caves["explore"]>;
export type { Cave, CavePlan, Opening };
