const RANDOM_SEEDS = 1_000_000;

export const withRandomSeed = (fixed: readonly number[]): number[] => [
  ...fixed,
  1 + Math.floor(Math.random() * RANDOM_SEEDS),
];
