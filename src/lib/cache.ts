export const createLru = <R>(capacity: number) => {
  const entries = new Map<string, R>();
  return {
    has: (key: string) => entries.has(key),
    get: (key: string): R | undefined => {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set: (key: string, value: R) => {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) entries.delete(entries.keys().next().value!);
    },
  };
};

export const memoize = <A, R>(compute: (arg: A) => R, keyOf: (arg: A) => string, capacity: number): ((arg: A) => R) => {
  const entries = createLru<R>(capacity);
  return (arg) => {
    const key = keyOf(arg);
    if (entries.has(key)) return entries.get(key)!;
    const value = compute(arg);
    entries.set(key, value);
    return value;
  };
};
