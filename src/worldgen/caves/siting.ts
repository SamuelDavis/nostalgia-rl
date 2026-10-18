import { type Point, distance, hash, hashString, memoize } from "../../lib";
import { MOUNTAIN_LEVEL } from "../biome";
import { heightLevel } from "../constants";
import type { Fields } from "../fields";
import type { Peak } from "../landmarks";
import { type Region, regionKey, regionOf, regionsAround } from "../region";

export interface Cave extends Point {
  readonly id: number;
  readonly region: Region;
  readonly level: number;
}

export interface CaveSitingInput {
  readonly seed: number;
  readonly fields: Fields;
  readonly peakOf: (region: Region) => Peak | undefined;
}

export const CAVE_SPACING = 160;
export const TERRITORY_RADIUS = 112;

const SALT = hashString("caves");
const MASS_PROBE_RADIUS = 32;
const MASS_PROBES = 16;
const MIN_MASS_PROBES = 12;
const CACHE = 4096;

const RING: readonly Point[] = Array.from({ length: MASS_PROBES }, (_, i) => {
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

export const createCaveSiting = ({ seed, fields, peakOf }: CaveSitingInput) => {
  const level = (p: Point) => heightLevel(fields.elevation(p.x, p.y));
  const isMassive = (peak: Peak) =>
    RING.filter((o) => level({ x: peak.x + o.x, y: peak.y + o.y }) >= MOUNTAIN_LEVEL).length >= MIN_MASS_PROBES;

  const candidateIn = memoize(
    (region: Region): Peak | undefined => {
      const peak = peakOf(region);
      return peak && isMassive(peak) ? peak : undefined;
    },
    regionKey,
    CACHE,
  );

  const cavesIn = memoize(
    (region: Region): Cave[] => {
      const candidate = candidateIn(region);
      if (!candidate) return [];
      const isOutranked = regionsAround(region, 1).some((other) => {
        const rival = candidateIn(other);
        return rival !== undefined && distance(rival, candidate) <= CAVE_SPACING && isHigher(rival, candidate);
      });
      if (isOutranked) return [];
      return [{ ...candidate, id: hash(seed, SALT, candidate.x, candidate.y), region }];
    },
    regionKey,
    CACHE,
  );

  const caveOwning = (p: Point): Cave | undefined => {
    const nearest = regionsAround(regionOf(p), 1)
      .flatMap(cavesIn)
      .reduce<Cave | undefined>(
        (best, cave) => (!best || distance(cave, p) < distance(best, p) ? cave : best),
        undefined,
      );
    return nearest && distance(nearest, p) <= TERRITORY_RADIUS ? nearest : undefined;
  };

  return { candidateIn, cavesIn, caveOwning };
};
