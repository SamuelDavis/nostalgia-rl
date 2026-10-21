import { expect, test } from "vitest";
import { generateChunk } from "./world";
import { createWorldgen } from "./world";

const CHUNK_BUDGET_MS = 8;

test("warm chunk generation fits the budget", async ({ bench }) => {
  const world = createWorldgen(1);
  for (let cy = -4; cy < 4; cy++) for (let cx = -4; cx < 4; cx++) generateChunk(world, cx, cy);
  let n = 0;
  const result = await bench("generateChunk", () => {
    generateChunk(world, (n % 8) - 4, (Math.floor(n / 8) % 8) - 4);
    n++;
  }).run();
  console.info(`mean ${result.latency.mean.toFixed(3)} ms`);
  expect(result.latency.mean).toBeLessThan(CHUNK_BUDGET_MS);
});
