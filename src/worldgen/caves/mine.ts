import { type Point, distance, hash, hashString, intBetween, lerp, unit } from "../../lib";

export interface Chamber extends Point {
  readonly radius: number;
}

export interface Tunnel {
  readonly a: Point;
  readonly b: Point;
  readonly path: readonly Point[];
}

export interface Entry {
  readonly at: Point;
  readonly heading: Point;
}

export interface Room {
  readonly centre: Point;
  readonly half: Point;
}

export interface Site {
  readonly chambers: readonly Chamber[];
  readonly tunnels: readonly Tunnel[];
  readonly canDig: (p: Point) => boolean;
  readonly canCut: (p: Point) => boolean;
}

export interface Workings {
  readonly rooms: readonly Room[];
  readonly tiles: readonly Point[];
}

const SALT = hashString("mines");
const REACH_LINKS = [2, 3] as const;
const ROOM_SCALES = [0.6, 1.4] as const;
const ROOM_JITTER = 2;
const BRANCH_COUNTS = [0, 2] as const;
const BRANCH_HALVES = [2, 4] as const;
const BRANCH_GAPS = [2, 6] as const;

export const CARDINALS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + Math.sign(to - from) * i);

export const corridor = (from: Point, to: Point, alongXFirst: boolean): Point[] =>
  alongXFirst
    ? [...range(from.x, to.x).map((x) => ({ x, y: from.y })), ...range(from.y, to.y).map((y) => ({ x: to.x, y }))]
    : [...range(from.y, to.y).map((y) => ({ x: from.x, y })), ...range(from.x, to.x).map((x) => ({ x, y: to.y }))];

export const roomTiles = ({ centre, half }: Room): Point[] =>
  range(centre.y - half.y, centre.y + half.y).flatMap((y) =>
    range(centre.x - half.x, centre.x + half.x).map((x) => ({ x, y })),
  );

export const edgeOf = ({ centre, half }: Room, outward: Point): Point => ({
  x: centre.x + outward.x * half.x,
  y: centre.y + outward.y * half.y,
});

export const sidesOf = (room: Room): { edge: Point; outward: Point }[] =>
  CARDINALS.flatMap((outward) => {
    const middle = edgeOf(room, outward);
    const span = outward.x !== 0 ? room.half.y : room.half.x;
    return range(-span, span).map((offset) => ({
      edge: { x: middle.x + Math.abs(outward.y) * offset, y: middle.y + Math.abs(outward.x) * offset },
      outward,
    }));
  });

const doorOf = (chamber: Chamber, path: readonly Point[]) =>
  path.find((p) => distance(p, chamber) > chamber.radius) ?? path.at(-1)!;

const between = ([min, max]: readonly [number, number], h: number) => lerp(min, max, unit(h));

export const workFloor = (site: Site, entry: Entry, h: number): Workings => {
  const [first] = [...site.chambers].sort((a, b) => distance(a, entry.at) - distance(b, entry.at));
  if (!first) return { rooms: [], tiles: [] };
  const tunnelsOf = (c: Point) => site.tunnels.filter((t) => t.a === c || t.b === c);
  const reach = intBetween(...REACH_LINKS, hash(h, SALT));
  const worked = new Set<Point>([first]);
  let frontier: Point[] = [first];
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
    const k = hash(h, SALT, c.x, c.y);
    return {
      centre: {
        x: c.x + intBetween(-ROOM_JITTER, ROOM_JITTER, hash(k, 1)),
        y: c.y + intBetween(-ROOM_JITTER, ROOM_JITTER, hash(k, 2)),
      },
      half: {
        x: Math.round(c.radius * between(ROOM_SCALES, hash(k, 3))),
        y: Math.round(c.radius * between(ROOM_SCALES, hash(k, 4))),
      },
    };
  };
  const rooms = chambers.map(roomOver);
  const roomOf = new Map(chambers.map((c, i) => [c as Point, rooms[i]!]));

  const branches = rooms.flatMap((room) => {
    const k = hash(h, SALT, room.centre.x, room.centre.y, 5);
    const start = hash(k, 1) % CARDINALS.length;
    return Array.from({ length: intBetween(...BRANCH_COUNTS, hash(k, 2)) }, (_, i) => {
      const outward = CARDINALS[(start + i * 2) % CARDINALS.length]!;
      const size = intBetween(...BRANCH_HALVES, hash(k, 3, i));
      const gap = intBetween(...BRANCH_GAPS, hash(k, 4, i));
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
      const alongXFirst = unit(hash(h, SALT, a.x, a.y, b.x, b.y)) < 0.5;
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

export const pickedInOrder = <T>(items: readonly T[], h: number): T[] =>
  items
    .map((item, i) => ({ item, order: hash(h, SALT, i) }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
