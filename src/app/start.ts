import type { ChunkRequest } from "../chunk-worker";
import type { Command } from "../command";
import { createChunkStore } from "../game/chunk-store";
import { type Act, createPlay } from "../game/play";
import { type Session, startSession } from "../game/session";
import { layersOf } from "../game/terrain";
import { MOVE_HINT, type Shortcut, bindKeys, bindTaps, bindWheel } from "../input/bindings";
import { actionFor, createDirectionInput } from "../input/directions";
import { HEIGHT_MODES, type HeightMode } from "../render/palette";
import { createTopDown } from "../render/top-down/renderer";
import { type Row, inputRows, sessionRows, topDownRows } from "../ui/debug";
import { createHud } from "../ui/hud";
import { createMap } from "../ui/map";
import { type Chunk, chunkOn, createWorldgen } from "../worldgen";
import { createAddressSync, launchFrom } from "./address";

const ZOOM_STEP = 4;

export const startGame = (host: HTMLElement, search: string) => {
  const { seed, turnMs, repeatDelayMs, start } = launchFrom(search);
  const world = createWorldgen(seed);
  const worker = new Worker(new URL("../chunk-worker.ts", import.meta.url), { type: "module" });
  const chunks = createChunkStore(
    (layer, cx, cy) => chunkOn(world, layer, cx, cy),
    (layer, cx, cy) => worker.postMessage({ seed, layer, cx, cy } satisfies ChunkRequest),
  );
  worker.addEventListener("message", ({ data }: MessageEvent<Chunk>) => chunks.receive(data));
  const layers = layersOf(world, chunks.chunkAt);
  const directions = createDirectionInput(repeatDelayMs);
  const syncAddress = createAddressSync(seed);

  const canvas = document.createElement("canvas");
  host.append(canvas);
  const now = performance.now();
  const play = createPlay(layers, startSession(start ?? world.spawn), turnMs, now);
  let mode: HeightMode = HEIGHT_MODES[0];
  let tapTurnsFirst = false;
  const view = createTopDown(canvas, { layers, session: play.session(), turnMs, now }, mode);

  const act: Act = (at, session) => {
    const press = directions.take(at);
    return press && actionFor(press, session.facing, tapTurnsFirst);
  };

  const command = (name: string, run: () => void): Command => ({ name, run });
  const zoomIn = command("zoom in", () => view.zoomBy(-ZOOM_STEP));
  const zoomOut = command("zoom out", () => view.zoomBy(ZOOM_STEP));
  const shortcuts: readonly Shortcut[] = [
    { keys: ["KeyI"], hint: "I", command: command("info", () => hud.toggle()) },
    { keys: ["KeyT"], hint: "T", command: command("tap mode", () => (tapTurnsFirst = !tapTurnsFirst)) },
    { keys: ["KeyM"], hint: "M", command: command("map", () => map.cycle(play.session(), mode)) },
    {
      keys: ["KeyH"],
      hint: "H",
      command: command("height mode", () => {
        mode = HEIGHT_MODES[(HEIGHT_MODES.indexOf(mode) + 1) % HEIGHT_MODES.length]!;
        view.showHeightAs(mode);
      }),
    },
    { keys: ["Equal", "NumpadAdd"], hint: "+", command: zoomIn },
    { keys: ["Minus", "NumpadSubtract"], hint: "−", command: zoomOut },
  ];
  const hud = createHud(host, shortcuts, MOVE_HINT);
  const map = createMap(host, world, chunks);

  let described: { readonly session: Session; readonly rows: readonly Row[] } | undefined;
  const describe = (session: Session): readonly Row[] => {
    if (described?.session !== session) {
      const tile = layers.terrainOn(session.layer)(session.position.x, session.position.y);
      described = { session, rows: sessionRows(world, session, tile, turnMs) };
    }
    return described.rows;
  };

  const frame = (now: number) => {
    const turn = play.advance(now, act);
    if (turn) {
      const { session } = turn;
      if (turn.moved) syncAddress(session.position);
      view.turned(turn);
      chunks.prefetch(session.layer, session.position, view.reach());
    }
    view.draw(now);
    if (hud.isOpen())
      hud.show([...describe(play.session()), ...inputRows(tapTurnsFirst), ...topDownRows(view.zoom(), mode)]);
    requestAnimationFrame(frame);
  };

  bindKeys(directions, shortcuts);
  bindTaps(canvas, directions);
  bindWheel((sign) => (sign < 0 ? zoomIn : zoomOut).run());
  requestAnimationFrame(frame);
};
