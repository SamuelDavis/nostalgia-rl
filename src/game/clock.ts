const MAX_CATCH_UP_MS = 250;

export const createTickClock = (tickMs: number, start: number) => {
  let next = start + tickMs;
  return {
    due: (now: number): number[] => {
      if (now - next > MAX_CATCH_UP_MS) next += Math.floor((now - next - MAX_CATCH_UP_MS) / tickMs + 1) * tickMs;
      const due: number[] = [];
      for (; next <= now; next += tickMs) due.push(next);
      return due;
    },
  };
};
