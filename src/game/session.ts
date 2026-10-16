import type { Point } from "../lib";
import { type Blocker, Direction, blockerBetween, stepToward } from "./movement";
import type { Terrain } from "./terrain";

export interface Session {
  readonly turn: number;
  readonly position: Point;
  readonly facing: Direction;
  readonly blocked: Blocker | undefined;
}

export const startSession = (position: Point): Session => ({
  turn: 0,
  position,
  facing: Direction.South,
  blocked: undefined,
});

export const playTurn = (session: Session, terrain: Terrain, direction: Direction | undefined): Session => {
  const turn = session.turn + 1;
  if (direction === undefined) return { ...session, turn };
  const { position } = session;
  const target = stepToward(position, direction);
  const blocked = blockerBetween(terrain(position.x, position.y), terrain(target.x, target.y));
  return { turn, position: blocked ? position : target, facing: direction, blocked };
};
