export const createTurnClock = (turnMs: number, start: number) => {
  let next = start + turnMs;
  return {
    due: (now: number): number | undefined => {
      if (now < next) return undefined;
      const scheduled = next;
      next = Math.max(next + turnMs, now);
      return scheduled;
    },
  };
};
