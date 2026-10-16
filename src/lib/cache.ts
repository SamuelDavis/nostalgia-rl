export const memoize = <A, R>(compute: (arg: A) => R, keyOf: (arg: A) => string, capacity: number): ((arg: A) => R) => {
  const entries = new Map<string, R>();
  return (arg) => {
    const key = keyOf(arg);
    if (entries.has(key)) {
      const value = entries.get(key)!;
      entries.delete(key);
      entries.set(key, value);
      return value;
    }
    const value = compute(arg);
    entries.set(key, value);
    if (entries.size > capacity) entries.delete(entries.keys().next().value!);
    return value;
  };
};
