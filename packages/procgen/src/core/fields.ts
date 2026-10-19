export type FieldDefinitions<P extends readonly number[], T> = {
  readonly [K in keyof T]: (at: T, ...p: P) => T[K];
};

const UNSET = Symbol("unset");
const PENDING = Symbol("pending");

export const defineFields = <P extends readonly number[], T extends object>(
  definitions: FieldDefinitions<P, T>,
): ((...p: P) => T) => {
  const keys = Object.keys(definitions) as (keyof T & string)[];
  interface Sample {
    position: P;
    slots: unknown[];
  }
  const prototype = {};
  keys.forEach((key, slot) =>
    Object.defineProperty(prototype, key, {
      enumerable: true,
      get(this: Sample & T) {
        const value = this.slots[slot];
        if (value === PENDING) throw new Error(`Field "${key}" depends on itself`);
        if (value !== UNSET) return value;
        this.slots[slot] = PENDING;
        return (this.slots[slot] = definitions[key](this, ...this.position));
      },
    }),
  );
  return (...p) => {
    const sample = Object.create(prototype) as Sample & T;
    sample.position = p;
    sample.slots = new Array<unknown>(keys.length).fill(UNSET);
    return sample;
  };
};

export type Interval = number | readonly [min: number, max: number];

export interface Zone<K extends string, Z> {
  readonly zone: Z;
  readonly at: { readonly [F in K]?: Interval };
}

const gapTo = (interval: Interval, v: number): number => {
  const [min, max] = typeof interval === "number" ? [interval, interval] : interval;
  return v < min ? min - v : v > max ? v - max : 0;
};

export const nearestZone =
  <K extends string, Z>(zones: readonly Zone<K, Z>[]) =>
  (conditions: { readonly [F in K]: number }): Z => {
    let best = zones[0]!;
    let bestDistance = Infinity;
    for (const candidate of zones) {
      let d = 0;
      for (const key of Object.keys(candidate.at) as K[]) {
        const gap = gapTo(candidate.at[key]!, conditions[key]);
        d += gap * gap;
      }
      if (d < bestDistance) [best, bestDistance] = [candidate, d];
    }
    return best.zone;
  };
