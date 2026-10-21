import { rivers } from "procgen/recipes";
import { SEA_LEVEL, heightLevel, metresToLevels } from "./constants";
import type { Fields } from "./fields";

export { type Lake, type River, type RiverNode, distanceToRiver } from "procgen/recipes";

const MAX_GORGE = metresToLevels(6);

export const createRivers = (seed: number, fields: Fields) =>
  rivers({
    name: "rivers",
    seed,
    drainage: fields.drainage,
    ground: (x, y) => Math.max(SEA_LEVEL - 1, heightLevel(fields.elevation(x, y))),
    rain: fields.moisture,
    seaLevel: SEA_LEVEL,
    maxGorge: MAX_GORGE,
  });

export type Rivers = ReturnType<typeof createRivers>;
