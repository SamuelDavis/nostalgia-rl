const lowbias32 = (x: number): number => {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
};

const GOLDEN = 0x9e3779b9;
const UINT32_RANGE = 0x1_0000_0000;
const bits = new DataView(new ArrayBuffer(8));

const mixKey = (h: number, key: number): number => {
  if ((key | 0) === key) return lowbias32((h ^ key) + GOLDEN);
  bits.setFloat64(0, key, true);
  return lowbias32((lowbias32((h ^ bits.getUint32(0, true)) + GOLDEN) ^ bits.getUint32(4, true)) + GOLDEN);
};

export const hash = (...keys: readonly number[]): number => keys.reduce(mixKey, lowbias32(keys.length));

const ARITY_3 = lowbias32(3);
const ARITY_4 = lowbias32(4);

export const hash3 = (a: number, b: number, c: number): number => mixKey(mixKey(mixKey(ARITY_3, a), b), c);

export const hash4 = (a: number, b: number, c: number, d: number): number =>
  mixKey(mixKey(mixKey(mixKey(ARITY_4, a), b), c), d);

export const hashString = (text: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return lowbias32(h);
};

export const unit = (h: number): number => h / UINT32_RANGE;

export type Salt = number | string;

const saltKey = (salt: Salt): number => (typeof salt === "string" ? hashString(salt) : salt);

const salted = (key: number, salts: readonly Salt[]): number =>
  salts.reduce<number>((k, salt) => hash(k, saltKey(salt)), key);

export interface Rng {
  readonly key: number;
  child(...salts: readonly Salt[]): Rng;
  u32(...keys: readonly number[]): number;
  unit(...keys: readonly number[]): number;
  int(min: number, max: number, ...keys: readonly number[]): number;
  chance(probability: number, ...keys: readonly number[]): boolean;
  pick<T>(items: readonly T[], ...keys: readonly number[]): T;
  weighted<T>(entries: readonly (readonly [item: T, weight: number])[], ...keys: readonly number[]): T;
  shuffle<T>(items: readonly T[], ...keys: readonly number[]): T[];
}

const rngFromKey = (key: number): Rng => {
  const u32 = (...keys: readonly number[]) => hash(key, ...keys);
  const draw = (...keys: readonly number[]) => unit(u32(...keys));
  return {
    key,
    child: (...salts) => rngFromKey(salted(key, salts)),
    u32,
    unit: draw,
    int: (min, max, ...keys) => min + Math.floor(draw(...keys) * (max - min + 1)),
    chance: (probability, ...keys) => draw(...keys) < probability,
    pick: (items, ...keys) => items[Math.floor(draw(...keys) * items.length)]!,
    weighted: (entries, ...keys) => {
      let remaining = draw(...keys) * entries.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [item, weight] of entries) {
        remaining -= weight;
        if (remaining < 0) return item;
      }
      return entries.at(-1)![0];
    },
    shuffle: (items, ...keys) => {
      const shuffled = [...items];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(draw(...keys, i) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      return shuffled;
    },
  };
};

export const rngOf = (seed: number, ...salts: readonly Salt[]): Rng => rngFromKey(salted(hash(seed), salts));
