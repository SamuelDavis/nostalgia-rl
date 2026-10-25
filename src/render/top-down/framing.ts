import type { Vec2 } from "procgen";
import { stepToward } from "../../game/movement";
import type { Turn } from "../../game/play";
import type { Session } from "../../game/session";
import type { Terrain } from "../../game/terrain";
import {
  type Extent,
  attentiveSpan,
  createCamera,
  lookOffset,
  modifierWithin,
  naturalSpan,
  openness,
  practicalSpan,
  sightAhead,
  spanOf,
  steer,
} from "./camera";

const opennessOn = (terrain: Terrain, p: Vec2) => openness((x, y) => terrain(x, y).height, p);

export interface Zoom {
  readonly span: number;
  readonly natural: number;
  readonly modifier: number;
}

export const createFraming = (session: Session, terrain: Terrain, now: number) => {
  const camera = createCamera();
  let open = opennessOn(terrain, session.position);
  let heading: Vec2 = { x: 0, y: 0 };
  let natural = naturalSpan(open, heading);
  let practical = practicalSpan(open, heading);
  let sight = sightAhead(terrain, session.position, session.facing);
  let zoomModifier = 0;
  let lastActionAt = now;
  let lastFrame = now;

  return {
    turned: ({ session, scheduled, moved, acted }: Turn, terrain: Terrain) => {
      if (acted) lastActionAt = scheduled;
      if (moved) open = opennessOn(terrain, session.position);
      heading = steer(heading, stepToward({ x: 0, y: 0 }, session.facing));
      natural = naturalSpan(open, heading);
      practical = practicalSpan(open, heading);
      sight = sightAhead(terrain, session.position, session.facing);
    },
    zoomBy: (delta: number) => {
      zoomModifier = modifierWithin(natural, zoomModifier + delta);
    },
    naturalSpan: () => spanOf(natural, zoomModifier),
    frame: (now: number, shown: Vec2, screen: Extent) => {
      const elapsed = now - lastFrame;
      lastFrame = now;
      const span = attentiveSpan({ natural, practical, sight: sight.distance }, now - lastActionAt);
      const view = camera(
        { position: shown, look: lookOffset(open, sight.lead), span: spanOf(span, zoomModifier) },
        screen,
        elapsed,
      );
      const zoom: Zoom = { span, natural, modifier: zoomModifier };
      return { view, zoom };
    },
  };
};
