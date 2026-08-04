/**
 * buildCorridors turns engine flows (hub→zone volumes from the min-cost-flow
 * solver) into LineString features for the corridor layer. Pure geometry +
 * pass-through of engine values — no cost or volume arithmetic here beyond
 * selecting which corridors to draw.
 */
import { describe, expect, it } from "vitest";
import { buildCorridors, MAGAZINE_HUB_ID } from "./corridors";
import type { FlowMapInfo, HubMapInfo, ZoneMapInfo } from "./types";

const hub = (id: string, lon: number, lat: number): HubMapInfo => ({
  id,
  name: id,
  lat,
  lon,
  emirate: "Dubai",
  capacity: 1000,
  status: "open",
  utilization_pct: 10,
  spare_capacity: 900,
  cost_to_serve: 50,
});

const zone = (id: string, lon: number, lat: number): ZoneMapInfo => ({
  id,
  name: id,
  lat,
  lon,
  emirate: "Dubai",
  demand: 100,
});

const flow = (hub_id: string, zone_id: string, volume: number): FlowMapInfo => ({
  hub_id,
  zone_id,
  volume,
});

const HUBS = [hub("H1", 55.0, 25.0), hub(MAGAZINE_HUB_ID, 55.36, 25.25)];
const ZONES = [zone("Z1", 55.1, 25.1), zone("Z2", 55.2, 25.2), zone("Z3", 55.3, 25.3)];

describe("buildCorridors", () => {
  it("draws a hub→zone line carrying the engine's flow volume", () => {
    const fc = buildCorridors(HUBS, ZONES, [flow("H1", "Z1", 120)], { mode: "domestic" });

    expect(fc.features).toHaveLength(1);
    const f = fc.features[0];
    expect(f.geometry.type).toBe("LineString");
    expect(f.geometry.coordinates).toEqual([
      [55.0, 25.0],
      [55.1, 25.1],
    ]);
    expect(f.properties).toMatchObject({ hub_id: "H1", zone_id: "Z1", volume: 120, magazine: false });
  });

  it("domestic mode excludes Magazine corridors; magazine mode shows only them", () => {
    const flows = [flow("H1", "Z1", 50), flow(MAGAZINE_HUB_ID, "Z2", 200)];

    const domestic = buildCorridors(HUBS, ZONES, flows, { mode: "domestic" });
    expect(domestic.features.map((f) => f.properties.hub_id)).toEqual(["H1"]);

    const magazine = buildCorridors(HUBS, ZONES, flows, { mode: "magazine" });
    expect(magazine.features.map((f) => f.properties.hub_id)).toEqual([MAGAZINE_HUB_ID]);
    expect(magazine.features[0].properties.magazine).toBe(true);
  });

  it("keeps only each hub's top-K corridors by volume", () => {
    const flows = [
      flow("H1", "Z1", 10),
      flow("H1", "Z2", 300),
      flow("H1", "Z3", 200),
    ];
    const fc = buildCorridors(HUBS, ZONES, flows, { mode: "domestic", topKPerHub: 2 });

    expect(fc.features.map((f) => f.properties.zone_id)).toEqual(["Z2", "Z3"]); // biggest first
  });

  it("silently skips flows pointing at unknown hubs or zones", () => {
    const flows = [flow("GHOST", "Z1", 50), flow("H1", "NOWHERE", 60), flow("H1", "Z1", 70)];
    const fc = buildCorridors(HUBS, ZONES, flows, { mode: "domestic" });

    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.volume).toBe(70);
  });

  it("drops zero-volume corridors — the solver routed nothing there", () => {
    const fc = buildCorridors(HUBS, ZONES, [flow("H1", "Z1", 0)], { mode: "domestic" });
    expect(fc.features).toHaveLength(0);
  });
});
