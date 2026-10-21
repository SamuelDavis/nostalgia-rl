import { type Rng, type Vec2, distance, lerp } from "procgen";

export interface Chamber extends Vec2 {
  readonly radius: number;
}

export interface Tunnel {
  readonly a: Vec2;
  readonly b: Vec2;
  readonly path: readonly Vec2[];
}

export interface Entry {
  readonly at: Vec2;
  readonly heading: Vec2;
}

export interface Room {
  readonly centre: Vec2;
  readonly half: Vec2;
}

export interface Site {
  readonly chambers: readonly Chamber[];
  readonly tunnels: readonly Tunnel[];
  readonly canDig: (p: Vec2) => boolean;
  readonly canCut: (p: Vec2) => boolean;
}

export interface Workings {
  readonly rooms: readonly Room[];
  readonly tiles: readonly Vec2[];
}

const REACH_LINKS = [2, 3] as const;
const ROOM_SCALES = [0.6, 1.4] as const;
const ROOM_JITTER = 2;
const BRANCH_COUNTS = [0, 2] as const;
const BRANCH_HALVES = [2, 4] as const;
const BRANCH_GAPS = [2, 6] as const;

export const CARDINALS: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + Math.sign(to - from) * i);

export const corridor = (from: Vec2, to: Vec2, alongXFirst: boolean): Vec2[] =>
  alongXFirst
    ? [...range(from.x, to.x).map((x) => ({ x, y: from.y })), ...range(from.y, to.y).map((y) => ({ x: to.x, y }))]
    : [...range(from.y, to.y).map((y) => ({ x: from.x, y })), ...range(from.x, to.x).map((x) => ({ x, y: to.y }))];

export const roomTiles = ({ centre, half }: Room): Vec2[] =>
  range(centre.y - half.y, centre.y + half.y).flatMap((y) =>
    range(centre.x - half.x, centre.x + half.x).map((x) => ({ x, y })),
  );

export const edgeOf = ({ centre, half }: Room, outward: Vec2): Vec2 => ({
  x: centre.x + outward.x * half.x,
  y: centre.y + outward.y * half.y,
});

export const sidesOf = (room: Room): { edge: Vec2; outward: Vec2 }[] =>
  CARDINALS.flatMap((outward) => {
    const middle = edgeOf(room, outward);
    const span = outward.x !== 0 ? room.half.y : room.half.x;
    return range(-span, span).map((offset) => ({
      edge: { x: middle.x + Math.abs(outward.y) * offset, y: middle.y + Math.abs(outward.x) * offset },
      outward,
    }));
  });

const doorOf = (chamber: Chamber, path: readonly Vec2[]) =>
  path.find((p) => distance(p, chamber) > chamber.radius) ?? path.at(-1)!;

const between = ([min, max]: readonly [number, number], rng: Rng, key: number) => lerp(min, max, rng.unit(key));

export const workFloor = (site: Site, entry: Entry, rng: Rng): Workings => {
  const [first] = [...site.chambers].sort((a, b) => distance(a, entry.at) - distance(b, entry.at));
  if (!first) return { rooms: [], tiles: [] };
  const tunnelsOf = (c: Vec2) => site.tunnels.filter((t) => t.a === c || t.b === c);
  const reach = rng.int(...REACH_LINKS, 0);
  const worked = new Set<Vec2>([first]);
  let frontier: Vec2[] = [first];
  for (let link = 0; link < reach; link++) {
    frontier = frontier.flatMap((c) =>
      tunnelsOf(c)
        .map((t) => (t.a === c ? t.b : t.a))
        .filter((n) => site.chambers.includes(n as Chamber) && !worked.has(n)),
    );
    frontier.forEach((n) => worked.add(n));
  }
  const chambers = site.chambers.filter((c) => worked.has(c));
  const roomOver = (c: Chamber): Room => {
    const room = rng.child("room", c.x, c.y);
    return {
      centre: {
        x: c.x + room.int(-ROOM_JITTER, ROOM_JITTER, 1),
        y: c.y + room.int(-ROOM_JITTER, ROOM_JITTER, 2),
      },
      half: {
        x: Math.round(c.radius * between(ROOM_SCALES, room, 3)),
        y: Math.round(c.radius * between(ROOM_SCALES, room, 4)),
      },
    };
  };
  const rooms = chambers.map(roomOver);
  const roomOf = new Map(chambers.map((c, i) => [c as Vec2, rooms[i]!]));

  const branches = rooms.flatMap((room) => {
    const branch = rng.child("branches", room.centre.x, room.centre.y);
    const start = branch.int(0, CARDINALS.length - 1, 1);
    return Array.from({ length: branch.int(...BRANCH_COUNTS, 2) }, (_, i) => {
      const outward = CARDINALS[(start + i * 2) % CARDINALS.length]!;
      const size = branch.int(...BRANCH_HALVES, 3, i);
      const gap = branch.int(...BRANCH_GAPS, 4, i);
      const edge = edgeOf(room, outward);
      const centre = { x: edge.x + outward.x * (gap + size), y: edge.y + outward.y * (gap + size) };
      return { room: { centre, half: { x: size, y: size } }, hall: corridor(room.centre, centre, outward.x !== 0) };
    });
  });

  const tunnels = site.tunnels.filter((t) => worked.has(t.a) && worked.has(t.b));
  const halls = [
    ...corridor(entry.at, rooms[0]!.centre, entry.heading.x !== 0),
    ...tunnels.flatMap((t) => {
      const [a, b] = [t.a as Chamber, t.b as Chamber];
      const [doorA, doorB] = [doorOf(a, t.path), doorOf(b, [...t.path].reverse())];
      const alongXFirst = rng.chance(0.5, a.x, a.y, b.x, b.y);
      return [
        ...corridor(roomOf.get(a)!.centre, doorA, alongXFirst),
        ...corridor(doorA, doorB, alongXFirst),
        ...corridor(doorB, roomOf.get(b)!.centre, !alongXFirst),
      ];
    }),
    ...branches.filter((b) => site.canDig(b.room.centre)).flatMap((b) => b.hall),
  ];
  return {
    rooms,
    tiles: [
      ...[...rooms, ...branches.filter((b) => site.canDig(b.room.centre)).map((b) => b.room)]
        .flatMap(roomTiles)
        .filter(site.canDig),
      ...halls.filter(site.canCut),
    ],
  };
};
