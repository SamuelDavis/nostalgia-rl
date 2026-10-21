import type { Vec2 } from "procgen";
import { type Layer, SURFACE } from "../worldgen";
import { type Blocker, Direction, blockerBetween, stepToward } from "./movement";
import type { Layers } from "./terrain";

export interface Session {
  readonly turn: number;
  readonly position: Vec2;
  readonly layer: Layer;
  readonly facing: Direction;
  readonly blocked: Blocker | undefined;
}

export interface Action {
  readonly kind: "face" | "step";
  readonly direction: Direction;
}

export const startSession = (position: Vec2): Session => ({
  turn: 0,
  position,
  layer: SURFACE,
  facing: Direction.South,
  blocked: undefined,
});

export const playTurn = (session: Session, { terrainOn, linkAcross }: Layers, action: Action | undefined): Session => {
  const turn = session.turn + 1;
  if (action === undefined) return { ...session, turn };
  const { kind, direction } = action;
  if (kind === "face") return { ...session, turn, facing: direction, blocked: undefined };
  const { position, layer } = session;
  const target = stepToward(position, direction);
  const beyond = linkAcross(layer, position, target) ?? layer;
  const blocked = blockerBetween(terrainOn(layer)(position.x, position.y), terrainOn(beyond)(target.x, target.y));
  return blocked
    ? { ...session, turn, facing: direction, blocked }
    : { turn, position: target, layer: beyond, facing: direction, blocked };
};
