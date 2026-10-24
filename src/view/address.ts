import type { Vec2 } from "procgen";

const DEFAULT_SEED = 1;
const DEFAULT_TURN_MS = 100;
const DEFAULT_REPEAT_DELAY_MS = 50;
const SYNC_DELAY_MS = 300;

export interface Launch {
  readonly seed: number;
  readonly turnMs: number;
  readonly repeatDelayMs: number;
  readonly start: Vec2 | undefined;
}

export const launchFrom = (search: string): Launch => {
  const params = new URLSearchParams(search);
  const numberOf = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
  const [x, y] = [params.get("x"), params.get("y")];
  return {
    seed: numberOf("seed", DEFAULT_SEED),
    turnMs: numberOf("turn", DEFAULT_TURN_MS),
    repeatDelayMs: numberOf("repeat", DEFAULT_REPEAT_DELAY_MS),
    start: x !== null && y !== null ? { x: Number(x), y: Number(y) } : undefined,
  };
};

export const createAddressSync = (seed: number) => {
  let pending: ReturnType<typeof setTimeout> | undefined;
  return (position: Vec2) => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      params.set("seed", String(seed));
      params.set("x", String(position.x));
      params.set("y", String(position.y));
      history.replaceState(null, "", `?${params}`);
    }, SYNC_DELAY_MS);
  };
};
