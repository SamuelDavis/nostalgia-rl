import type { Ticks } from "../game/play";
import type { Session } from "../game/session";
import type { Layers } from "../game/terrain";

export interface Stage {
  readonly layers: Layers;
  readonly session: Session;
  readonly tickMs: number;
  readonly now: number;
}

export interface Renderer {
  readonly ticked: (ticks: Ticks) => void;
  readonly draw: (now: number) => void;
  readonly reach: () => number;
}
