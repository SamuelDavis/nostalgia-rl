export const fewerMoreLikely = (max: number): (readonly [count: number, weight: number])[] =>
  Array.from({ length: max }, (_, i) => [i + 1, max - i] as const);
