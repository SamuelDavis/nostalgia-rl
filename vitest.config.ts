import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 20_000,
    tags: [
      {
        name: "slow",
        description: "Sweeps many seeds or regions; excluded from npm test, run before merge",
        timeout: 120_000,
      },
    ],
  },
});
