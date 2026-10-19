import { describe, expect, it } from "vitest";
import { defineFields, nearestZone } from "./fields";

interface Conditions {
  readonly elevation: number;
  readonly temperature: number;
  readonly lawlessness: number;
}

describe("defineFields", () => {
  it("evaluates each field lazily and once per sample, letting fields read each other", () => {
    let elevationCalls = 0;
    const conditionsAt = defineFields<[x: number, y: number], Conditions>({
      elevation: (_, x) => {
        elevationCalls++;
        return x / 100;
      },
      temperature: (at) => 1 - at.elevation,
      lawlessness: (at, _, y) => at.elevation + y,
    });
    const sample = conditionsAt(50, 2);
    expect(elevationCalls).toBe(0);
    expect(sample.temperature).toBe(0.5);
    expect(sample.lawlessness).toBe(2.5);
    expect(elevationCalls).toBe(1);
    const origin = conditionsAt(0, 0);
    expect([origin.elevation, origin.temperature, origin.lawlessness]).toEqual([0, 1, 0]);
  });

  it("reports a field that depends on itself", () => {
    const loop = defineFields<[], { a: number; b: number }>({ a: (at) => at.b, b: (at) => at.a });
    expect(() => loop().a).toThrow(/depends on itself/);
  });
});

describe("nearestZone", () => {
  const zoneOf = nearestZone<"temperature" | "humidity", string>([
    { zone: "desert", at: { temperature: [0.7, 1], humidity: [0, 0.3] } },
    { zone: "jungle", at: { temperature: [0.7, 1], humidity: [0.7, 1] } },
    { zone: "tundra", at: { temperature: [0, 0.2] } },
  ]);

  it("picks the zone whose box contains the conditions", () => {
    expect(zoneOf({ temperature: 0.9, humidity: 0.1 })).toBe("desert");
    expect(zoneOf({ temperature: 0.1, humidity: 0.9 })).toBe("tundra");
  });

  it("falls back to the nearest box, ignoring parameters a zone leaves open", () => {
    expect(zoneOf({ temperature: 0.8, humidity: 0.6 })).toBe("jungle");
    expect(zoneOf({ temperature: 0.3, humidity: 0.5 })).toBe("tundra");
  });
});
