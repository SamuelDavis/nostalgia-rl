import type { Vec2 } from "procgen";

export interface Frame {
  readonly origin: Vec2;
  readonly forward: Vec2;
}

export const lateralOf = (forward: Vec2): Vec2 => ({ x: -forward.y, y: forward.x });

export const toWorld = ({ origin, forward }: Frame, u: number, v: number): Vec2 => {
  const lateral = lateralOf(forward);
  return { x: origin.x + lateral.x * u + forward.x * v, y: origin.y + lateral.y * u + forward.y * v };
};

export const toLocal = ({ origin, forward }: Frame, p: Vec2) => {
  const lateral = lateralOf(forward);
  const d = { x: p.x - origin.x, y: p.y - origin.y };
  return { u: d.x * lateral.x + d.y * lateral.y, v: d.x * forward.x + d.y * forward.y };
};

export const isAcross = ({ forward }: Frame): boolean => forward.x === 0;
