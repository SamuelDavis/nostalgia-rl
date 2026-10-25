import type { Turn } from "../game/play";
import type { Session } from "../game/session";
import type { Layers } from "../game/terrain";

export interface Stage {
  readonly layers: Layers;
  readonly session: Session;
  readonly turnMs: number;
  readonly now: number;
}

export interface Renderer {
  readonly turned: (turn: Turn) => void;
  readonly draw: (now: number) => void;
  readonly reach: () => number;
}
