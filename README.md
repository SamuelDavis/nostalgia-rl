# Nostalgia RL

A real-time, open-world roguelike with peer-to-peer drop-in multiplayer, in the browser.

It follows the classic roguelike conventions: a grid, turn-based movement, cardinal facing, and glyph-first presentation. The difference is that turns run on a real-time clock, as in _Crypt of the NecroDancer_: the world advances one turn about every 250 ms whether or not you act. The world is one seeded, infinite, contiguous map with Minecraft-style terrain and features (camps and deep forests, later towns and caves), not a stack of separate dungeon maps. Friends join a running world in real time.

This file is the handoff document for a fresh session. It gives intent and current state and links to topical docs. Read the linked docs only when your task touches them. Domain vocabulary is in [CONTEXT.md](CONTEXT.md); architectural decisions are in [docs/adr](docs/adr).

## How we work

Development is phased and driven by playtests. The design is revealed progressively rather than specified up front.

1. **Interview.** At the start of a phase, a few questions establish what this phase must deliver and how the user will judge it.
2. **Build the smallest playable increment** that answers the phase's question.
3. **Playtest.** The user plays it. Their feedback is recorded verbatim in the phase doc and drives the next iteration.
4. **Iterate or advance.** Repeat until the user is satisfied, then start the next phase.

Stop at each playable increment and hand it to the user. Verify things the way the user will experience them, by running and playing them. Tests protect logic, but they don't stand in for a playtest. When reporting, say plainly what you could not verify.

Make a decision when the current phase needs it, and record it in that phase's doc. Future phases are deliberately unplanned. Candidate directions the user liked are in [docs/ideas.md](docs/ideas.md); adopt one only when a phase calls for it.

The overall progression follows the r/roguelikedev [Complete Roguelike Tutorial](https://rogueliketutorials.com/): map, player movement, field of view, monsters, combat, items, and so on. We adapt each step to a real-time clock and an open overworld, and multiplayer comes in when the user asks for it.

## Multiplayer requirements

These are requirements, not designs. How to meet them is decided in the multiplayer phase. Earlier phases should avoid choices that would make them hard to meet.

- **Serverless peer-to-peer:** WebRTC, using STUN and the user's Cloudflare TURN server for traversal. There is no game server, and running costs stay minimal.
- **Minecraft-style hosting:** a player generates a world, plays it, and shares a key. Friends join and leave in real time. There are no lobbies or accounts, and chat happens on other platforms.
- **Any number of players:** no hard cap. The game warns or suggests limits based on observed network traffic and known peer-to-peer constraints.
- **Intercontinental latency:** play stays fair and responsive between continents. The ~250 ms turn clock is the main budget for absorbing latency.
- **Determinism:** each peer generates terrain locally from the seed (see [docs/worldgen.md](docs/worldgen.md#determinism)). Only changes and live state cross the network.

## Current state

- **Phase 1, world generation:** in progress. See [docs/phases/01-worldgen.md](docs/phases/01-worldgen.md).
- A deterministic, seeded world generator exists in `src/worldgen`. It was carried over from an earlier prototype as a starting point; treat it as a draft that playtests will reshape, not a settled design. How it works: [docs/worldgen.md](docs/worldgen.md).
- `npm run dev` gives a walkable world: `@` on the turn clock (WASD, or press a screen triangle), glyph canvas with a camera that leads the facing direction and zooms out on high ground, debug HUD with a button for each toggle (starts collapsed; I expands it), M map, H height mode, +/− or wheel zoom. URL params: `seed`, `turn` (ms), `repeat` (ms a key is held before it repeats), `x`, `y` (start tile); the URL follows the player.

## Layout

| Path           | Contents                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------- |
| `src/lib`      | Game-agnostic utilities: hashing, seeded noise, math, A\*, LRU memoize                   |
| `src/worldgen` | World generation ([docs/worldgen.md](docs/worldgen.md)); `features/` holds feature types |
| `src/game`     | Game state and rules, independent of presentation                                        |
| `src/view`     | Canvas viewport, HTML HUD and map, palette shared with `tooling`                         |
| `tooling`      | Node scripts for development, e.g. the offline map renderer                              |
| `docs/phases`  | One doc per phase: goal, decisions, playtest log                                         |

## Commands

| Command                             | Purpose                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `npm run dev`                       | Vite dev server                                                |
| `npm test`                          | Unit tests (Vitest), excluding those tagged `slow`             |
| `npm run test:all`                  | All tests                                                      |
| `npm run lint`                      | ESLint (determinism rules)                                     |
| `npm run verify`                    | Typecheck, lint and all tests; run before merging              |
| `npm run bench`                     | Benchmarks (`*.bench.ts`)                                      |
| `npm run typecheck`                 | TypeScript                                                     |
| `npm run map -- --seed 1 --scale 8` | Render the world to `artifacts/map.png` (see docs/worldgen.md) |
| `npm run format`                    | Prettier                                                       |

## Conventions

- **TypeScript and Vite**, browser-only at runtime. Node is used only for tooling and tests.
- **Determinism:** anything a peer must reproduce independently is a pure function of seed and coordinates. The rules are in [docs/worldgen.md](docs/worldgen.md#determinism).
- **Single source of truth:** docs reference code rather than restating it. Keep this README short; add topical docs under `docs/` and link them here.
- **Data-authoritative:** game state is plain data advanced by pure functions (`playTurn` in `src/game/session.ts`); it never depends on rendering, and the view only communicates it, so the UI is swappable (GUI, CLI, test harness). This is what deterministic multiplayer needs. Don't let it override phase goals.
- **Git:** solo project. Use short-lived branches merged into the main branch once green, with conventional commit messages.
