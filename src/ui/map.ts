import type { HeightMode } from "../render/palette";
import { type HeldChunks, type OverviewOf, type Whereabouts, createMapPainter } from "../render/map/painter";

const MAP_VIEWS = ["closed", "overview", "local"] as const;
type MapView = (typeof MAP_VIEWS)[number];

export const createMap = (parent: HTMLElement, overviewOf: OverviewOf, chunks: HeldChunks) => {
  const canvas = document.createElement("canvas");
  canvas.className = "map";
  canvas.hidden = true;
  parent.append(canvas);
  const painter = createMapPainter(canvas, overviewOf, chunks);
  let view: MapView = "closed";

  const cycle = (whereabouts: Whereabouts, mode: HeightMode) => {
    view = MAP_VIEWS[(MAP_VIEWS.indexOf(view) + 1) % MAP_VIEWS.length]!;
    canvas.hidden = view === "closed";
    if (view === "closed") painter.stop();
    if (view === "overview") painter.paintOverview(whereabouts.position, mode);
    if (view === "local") painter.paintLocal(whereabouts, mode);
  };

  const prepare = ({ position }: Whereabouts, mode: HeightMode) => painter.prepareOverview(position, mode);

  return { cycle, prepare };
};
