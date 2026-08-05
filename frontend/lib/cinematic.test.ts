/**
 * Cinematic display helpers. Heights are a DISPLAY encoding (like line
 * widths) — these tests pin the 2.5:1 ratio contract and that story beats
 * select hubs purely by existing engine fields, no arithmetic on values.
 */
import { describe, expect, it } from "vitest";
import { normalizedPillarHeight, pickStoryBeats } from "./cinematic";
import type { HubMapInfo } from "./types";

const hub = (id: string, required: number, util: number): HubMapInfo => ({
  id, name: `Hub ${id}`, lat: 25, lon: 55, emirate: "Dubai", capacity: 1000,
  status: "open", utilization_pct: util, spare_capacity: 100, cost_to_serve: 50,
  required_headcount: required,
});

describe("normalizedPillarHeight — tallest ≈ 2.5× shortest", () => {
  const hubs = [hub("A", 2, 10), hub("B", 10, 20), hub("C", 30, 30)];

  it("maps the smallest hub to the base height", () => {
    expect(normalizedPillarHeight(hubs[0], hubs)).toBe(3000);
  });
  it("maps the largest hub to exactly 2.5x the base", () => {
    expect(normalizedPillarHeight(hubs[2], hubs)).toBe(7500);
  });
  it("keeps intermediate hubs strictly between", () => {
    const mid = normalizedPillarHeight(hubs[1], hubs);
    expect(mid).toBeGreaterThan(3000);
    expect(mid).toBeLessThan(7500);
  });
  it("degrades to the base height when all hubs are equal", () => {
    const flat = [hub("A", 5, 10), hub("B", 5, 20)];
    expect(normalizedPillarHeight(flat[0], flat)).toBe(3000);
  });
});

describe("pickStoryBeats — selection by engine fields only", () => {
  const hubs = [hub("A", 2, 90), hub("B", 30, 15), hub("C", 10, 40)];

  it("busiest = highest required_headcount; stressed = highest utilization_pct", () => {
    const beats = pickStoryBeats(hubs);
    expect(beats?.busiest.id).toBe("B");
    expect(beats?.stressed.id).toBe("A");
  });
  it("returns null when there are no hubs", () => {
    expect(pickStoryBeats([])).toBeNull();
  });
});
