import type { Vec2 } from "procgen";
import { stepToward } from "../game/movement";
import type { Session } from "../game/session";
import type { Terrain } from "../game/terrain";
import {
  type Extent,
  approach,
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
import { createGlide, facingAngle, turnToward } from "./motion";

const EYE_EASING_MS = 300;
const TURN_EASING_MS = 60;

const opennessOn = (terrain: Terrain, p: Vec2) => openness((x, y) => terrain(x, y).height, p);

export interface Turned {
  readonly session: Session;
  readonly terrain: Terrain;
  readonly scheduled: number;
  readonly moved: boolean;
  readonly acted: boolean;
}

export const createFraming = (turnMs: number, session: Session, terrain: Terrain, now: number) => {
  const camera = createCamera();
  const glide = createGlide(turnMs, session.position);
  let open = opennessOn(terrain, session.position);
  let heading: Vec2 = { x: 0, y: 0 };
  let natural = naturalSpan(open, heading);
  let practical = practicalSpan(open, heading);
  let sight = sightAhead(terrain, session.position, session.facing);
  let zoomModifier = 0;
  let lastActionAt = now;
  let lastFrame = now;
  let angle = facingAngle(session.facing);
  let eyeLevel = terrain(session.position.x, session.position.y).height;

  return {
    turned: ({ session, terrain, scheduled, moved, acted }: Turned) => {
      if (acted) lastActionAt = scheduled;
      if (moved) {
        glide.moveTo(session.position, scheduled);
        open = opennessOn(terrain, session.position);
      }
      heading = steer(heading, stepToward({ x: 0, y: 0 }, session.facing));
      natural = naturalSpan(open, heading);
      practical = practicalSpan(open, heading);
      sight = sightAhead(terrain, session.position, session.facing);
    },
    zoomBy: (delta: number) => {
      zoomModifier = modifierWithin(natural, zoomModifier + delta);
    },
    naturalSpan: () => spanOf(natural, zoomModifier),
    frame: (now: number, session: Session, terrain: Terrain, screen: Extent) => {
      const elapsed = now - lastFrame;
      lastFrame = now;
      const shown = glide.shownAt(now);
      angle = turnToward(angle, facingAngle(session.facing), elapsed, TURN_EASING_MS);
      eyeLevel = approach(eyeLevel, terrain(session.position.x, session.position.y).height, elapsed, EYE_EASING_MS);
      const span = attentiveSpan({ natural, practical, sight: sight.distance }, now - lastActionAt);
      const view = camera(
        { position: shown, look: lookOffset(open, sight.lead), span: spanOf(span, zoomModifier) },
        screen,
        elapsed,
      );
      return { view, shown, angle, eyeLevel, zoom: { span, natural, modifier: zoomModifier } };
    },
  };
};
