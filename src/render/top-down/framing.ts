import type { Vec2 } from "procgen";
import type { Ticks } from "../../game/play";
import type { Session } from "../../game/session";
import type { Terrain } from "../../game/terrain";
import { layerKey } from "../../worldgen";
import { facingAngle, turnToward } from "../motion";
import {
  type Extent,
  OPEN_SPAN,
  SIGHT_REACH,
  createCamera,
  leadOf,
  modifierWithin,
  sightRange,
  spanFor,
  spanOf,
  surveyFrom,
} from "./camera";

const TURN_EASING_MS = 250;

export interface Zoom {
  readonly span: number;
  readonly sight: number;
  readonly modifier: number;
}

const placeOf = ({ layer, position }: Session) => `${layerKey(layer)} ${position.x},${position.y}`;

export const createFraming = (session: Session, terrain: Terrain, now: number) => {
  const camera = createCamera();
  let surveyed = placeOf(session);
  let survey = surveyFrom(terrain, session.position);
  let heading = session.facing;
  let facing = facingAngle(heading);
  let modifier = 0;
  let zoom: Zoom = { span: OPEN_SPAN, sight: SIGHT_REACH, modifier };
  let lastFrame = now;

  return {
    ticked: ({ session }: Ticks, terrain: Terrain) => {
      heading = session.facing;
      if (placeOf(session) === surveyed) return;
      surveyed = placeOf(session);
      survey = surveyFrom(terrain, session.position);
    },
    zoomBy: (delta: number) => {
      modifier = modifierWithin(OPEN_SPAN, modifier + delta);
    },
    widestSpan: () => spanOf(OPEN_SPAN, modifier),
    zoom: () => zoom,
    frame: (now: number, shown: Vec2, screen: Extent) => {
      const elapsed = now - lastFrame;
      lastFrame = now;
      facing = turnToward(facing, facingAngle(heading), elapsed, TURN_EASING_MS);
      const sight = sightRange(survey, facing);
      zoom = { span: spanFor(sight), sight, modifier };
      return camera(
        { position: shown, lead: leadOf(survey, facing), span: spanOf(zoom.span, modifier) },
        screen,
        elapsed,
      );
    },
  };
};
