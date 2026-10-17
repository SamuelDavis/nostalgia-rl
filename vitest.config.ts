import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    tags: [
      {
        name: "slow",
        description: "Sweeps many seeds or regions; excluded from npm test, run before merge",
        timeout: 120_000,
      },
    ],
  },
});
