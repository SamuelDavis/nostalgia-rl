import { describe, expect, it } from "vitest";
import { Biome } from "./terrain";
import { Identity, UNCANNY_THRESHOLD, createProvinces, identityOf } from "./provinces";
import { createFields } from "./fields";
import { createWorld } from "procgen";

describe("identityOf", () => {
  it("takes its identity from the land at its seat", () => {
    expect(identityOf(Biome.Grassland, 0)).toBe(Identity.Farmland);
    expect(identityOf(Biome.Forest, 0)).toBe(Identity.Woodland);
    expect(identityOf(Biome.Mountain, 0)).toBe(Identity.Highland);
    expect(identityOf(Biome.Desert, 0)).toBe(Identity.Wilds);
  });

  it("is uncanny wherever the uncanny field passes its threshold, whatever the land", () => {
    expect(identityOf(Biome.Grassland, UNCANNY_THRESHOLD + 0.01)).toBe(Identity.Uncanny);
    expect(identityOf(Biome.Mountain, UNCANNY_THRESHOLD + 0.01)).toBe(Identity.Uncanny);
  });
});

describe("provinces", () => {
  const seed = 1;
  const world = createWorld(seed);
  const provinces = createProvinces(createFields(seed));

  it("give every tile the province of its nearest seat", () => {
    const at = { x: 300, y: -700 };
    const province = provinces.provinceAt(world, at);
    const seats = provinces.seatsAround(world, at);
    const nearest = Math.min(...seats.map((s) => Math.hypot(s.x - at.x, s.y - at.y)));
    expect(Math.hypot(province.x - at.x, province.y - at.y)).toBe(nearest);
  });

  it("include each identity somewhere", { tags: "slow" }, () => {
    const found = new Set<Identity>();
    for (let col = -12; col <= 12; col++)
      for (let row = -12; row <= 12; row++)
        found.add(provinces.provinceAt(world, { x: col * 1024, y: row * 1024 }).identity);
    expect([...found].sort()).toEqual(Object.values(Identity).sort());
  });
});
