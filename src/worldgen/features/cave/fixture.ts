import { createWorld } from "procgen";
import { createFields } from "../../fields";
import { createPeaks } from "../../landmarks";
import { createCaves } from "./cave";

export const cavesWithWayness = (seed: number, wayness: number) => {
  const fields = createFields(seed);
  const caves = createCaves({ seed, fields, peaks: createPeaks(fields), waynessAt: () => wayness, waynessReads: [] });
  return { fields, caves: caves.explore(createWorld(seed)) };
};
