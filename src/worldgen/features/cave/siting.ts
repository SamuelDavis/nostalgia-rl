import {
  type Cell,
  type Reader,
  type Stage,
  type Vec2,
  boundsOf,
  distance,
  nearest,
  rngOf,
  samePoint,
  stage,
} from "procgen";
import { MOUNTAIN_LEVEL } from "../../biome";
import { heightLevel } from "../../constants";
import type { Fields } from "../../fields";
import type { Peak } from "../../landmarks";
import { regions } from "../../region";

export interface Cave extends Vec2 {
  readonly id: number;
  readonly region: Cell;
  readonly level: number;
}

export interface CaveSitingInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly peaks: Stage<Peak | undefined>;
}

export const CAVE_SPACING = 160;
export const TERRITORY_RADIUS = 112;

const MASS_PROBE_RADIUS = 32;
const MASS_PROBES = 16;
const MIN_MASS_PROBES = 12;

const RING: readonly Vec2[] = Array.from({ length: MASS_PROBES }, (_, i) => {
  const side = MASS_PROBES / 4;
  const along = -MASS_PROBE_RADIUS + ((i % side) * 2 * MASS_PROBE_RADIUS) / side;
  return [
    { x: along, y: -MASS_PROBE_RADIUS },
    { x: MASS_PROBE_RADIUS, y: along },
    { x: -along, y: MASS_PROBE_RADIUS },
    { x: -MASS_PROBE_RADIUS, y: -along },
  ][Math.floor(i / side)]!;
});

const isHigher = (a: Peak, b: Peak) =>
  a.level > b.level || (a.level === b.level && (a.x > b.x || (a.x === b.x && a.y > b.y)));

export const createCaveSiting = ({ seed, fields, peaks }: CaveSitingInput) => {
  const rng = rngOf(seed, "caves");
  const level = (p: Vec2) => heightLevel(fields.elevation(p.x, p.y));
  const isMassive = (peak: Peak) =>
    RING.filter((o) => level({ x: peak.x + o.x, y: peak.y + o.y }) >= MOUNTAIN_LEVEL).length >= MIN_MASS_PROBES;

  const candidates = stage({
    name: "cave candidates",
    grid: regions,
    reads: [{ stage: peaks, radius: 0 }],
    compute: (region, { read }): readonly Peak[] => {
      const peak = read(peaks, region);
      return peak && isMassive(peak) ? [peak] : [];
    },
  });

  const caves = stage({
    name: "caves",
    grid: regions,
    reads: [{ stage: candidates, radius: CAVE_SPACING }],
    compute: (region, { read, gather }): readonly Cave[] =>
      read(candidates, region).flatMap((candidate) => {
        const isOutranked = gather(candidates, boundsOf([candidate], CAVE_SPACING)).some(
          (rival) =>
            !samePoint(rival, candidate) && distance(rival, candidate) <= CAVE_SPACING && isHigher(rival, candidate),
        );
        return isOutranked ? [] : [{ ...candidate, id: rng.u32(candidate.x, candidate.y), region }];
      }),
  });

  const caveOwning = (reader: Reader, p: Vec2): Cave | undefined => nearest(reader, caves, p, TERRITORY_RADIUS);

  return { candidates, caves, caveOwning };
};

export type CaveSiting = ReturnType<typeof createCaveSiting>;
