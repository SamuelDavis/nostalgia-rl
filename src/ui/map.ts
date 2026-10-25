import type { HeightMode } from "../render/palette";
import { type HeldChunks, type Whereabouts, createMapPainter } from "../render/map/painter";
import type { Worldgen } from "../worldgen";

const MAP_VIEWS = ["closed", "overview", "local"] as const;
type MapView = (typeof MAP_VIEWS)[number];

export const createMap = (parent: HTMLElement, world: Worldgen, chunks: HeldChunks) => {
  const canvas = document.createElement("canvas");
  canvas.className = "map";
  canvas.hidden = true;
  parent.append(canvas);
  const painter = createMapPainter(canvas, world, chunks);
  let view: MapView = "closed";

  const cycle = (whereabouts: Whereabouts, mode: HeightMode) => {
    view = MAP_VIEWS[(MAP_VIEWS.indexOf(view) + 1) % MAP_VIEWS.length]!;
    canvas.hidden = view === "closed";
    if (view === "closed") painter.stop();
    if (view === "overview") painter.paintOverview(whereabouts.position, mode);
    if (view === "local") painter.paintLocal(whereabouts, mode);
  };

  return { cycle };
};
