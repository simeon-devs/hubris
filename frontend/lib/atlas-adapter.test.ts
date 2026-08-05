/**
 * atlas-adapter: API → design-model mapping for the AtlasVision home page.
 * Field renames + camera auto-fit + decorative density scaling. The load
 * formula ((busy/100)*cap) is the one prescribed by the integration spec.
 */
import { describe, expect, it } from "vitest";
import {
  autoFitCamera,
  densityDots,
  kpiView,
  medianCapacity,
  nearestZoneEmirate,
  toDesignModel,
} from "./atlas-adapter";
import type { KpisResponse, NetworkMapResponse } from "./types";

const network: NetworkMapResponse = {
  distance_mode: "haversine_fallback",
  fleet_types: [],
  hubs: [
    { id: "H1", name: "Abu Dhabi Hub", lat: 24.46, lon: 54.37, emirate: "Abu Dhabi",
      capacity: 45000, status: "open", utilization_pct: 62, spare_capacity: 100,
      cost_to_serve: 50, required_headcount: 48 },
    { id: "H2", name: "Dubai Central", lat: 25.2, lon: 55.27, emirate: "Dubai",
      capacity: 72000, status: "open", utilization_pct: 84, spare_capacity: 100,
      cost_to_serve: 50, required_headcount: 86 },
    { id: "H3", name: "Sharjah Hub", lat: 25.34, lon: 55.43, emirate: "Sharjah",
      capacity: 38000, status: "open", utilization_pct: 71, spare_capacity: 100,
      cost_to_serve: 50, required_headcount: 39 },
    { id: "H4", name: "Ajman Point", lat: 25.41, lon: 55.47, emirate: "Ajman",
      capacity: 13500, status: "open", utilization_pct: 35, spare_capacity: 100,
      cost_to_serve: 50, required_headcount: 11 },
    { id: "H5", name: "RAK Hub", lat: 25.78, lon: 55.95, emirate: "RAK",
      capacity: 16000, status: "open", utilization_pct: 44, spare_capacity: 100,
      cost_to_serve: 50, required_headcount: 14 },
  ],
  zones: [
    { id: "Z1", name: "Z1", lat: 25.1, lon: 55.2, emirate: "Dubai", demand: 300 },
    { id: "Z2", name: "Z2", lat: 24.5, lon: 54.4, emirate: "Abu Dhabi", demand: 120 },
  ],
  flows: [
    { hub_id: "H2", zone_id: "Z1", volume: 280 },
    { hub_id: "H1", zone_id: "Z1", volume: 20 },
    { hub_id: "H1", zone_id: "Z2", volume: 120 },
  ],
};

describe("toDesignModel", () => {
  const model = toDesignModel(network);

  it("renames API fields to the design's names", () => {
    const h = model.hubs.find((x) => x.id === "H2")!;
    expect(h.cap).toBe(72000);
    expect(h.busy).toBe(84);
    expect(h.couriers).toBe(86);
    expect(h.load).toBe((84 / 100) * 72000); // spec-prescribed display load
  });

  it("gives cards to exactly the 4 highest-load hubs with offsets", () => {
    const carded = model.hubs.filter((h) => h.card);
    expect(carded.map((h) => h.id).sort()).toEqual(["H1", "H2", "H3", "H5"].sort());
    for (const h of carded) expect(h.off).toHaveLength(2);
    expect(model.hubs.find((h) => h.id === "H4")!.card).toBe(false);
  });

  it("assigns each zone to its dominant hub from the flows", () => {
    expect(model.zones.find((z) => z.id === "Z1")!.hubId).toBe("H2"); // 280 > 20
    expect(model.zones.find((z) => z.id === "Z2")!.hubId).toBe("H1");
  });
});

describe("autoFitCamera", () => {
  it("centers on the data's bounding box", () => {
    const cam = autoFitCamera(toDesignModel(network), 1600, 900);
    expect(cam.lon).toBeCloseTo((54.37 + 55.95) / 2, 5);
    expect(cam.lat).toBeCloseTo((24.46 + 25.78) / 2, 5);
    expect(cam.zoom).toBeGreaterThan(80);
    expect(cam.zoom).toBeLessThanOrEqual(420);
  });

  it("falls back to the prototype's UAE camera when there is no data", () => {
    const cam = autoFitCamera({ hubs: [], zones: [] }, 1600, 900);
    expect(cam).toEqual({ lon: 55.05, lat: 24.92, zoom: 215 });
  });
});

describe("densityDots — decorative only", () => {
  it("multiplies dots 3–5x per zone when fewer than 150 zones", () => {
    const dots = densityDots(toDesignModel(network).zones);
    expect(dots.length).toBeGreaterThanOrEqual(network.zones.length * 3);
    expect(dots.length).toBeLessThanOrEqual(network.zones.length * 5);
  });

  it("is deterministic (seeded)", () => {
    const a = densityDots(toDesignModel(network).zones);
    const b = densityDots(toDesignModel(network).zones);
    expect(a).toEqual(b);
  });

  it("keeps one dot per zone at 150+ zones", () => {
    const many = {
      ...network,
      zones: Array.from({ length: 150 }, (_, i) => ({
        id: `Z${i}`, name: `Z${i}`, lat: 25, lon: 55, emirate: "Dubai", demand: 10,
      })),
      flows: [],
    };
    expect(densityDots(toDesignModel(many).zones)).toHaveLength(150);
  });
});

describe("helpers", () => {
  it("medianCapacity picks the middle hub capacity", () => {
    expect(medianCapacity(toDesignModel(network).hubs)).toBe(38000);
  });
  it("nearestZoneEmirate compares squared distances only", () => {
    expect(nearestZoneEmirate(toDesignModel(network).zones, 25.09, 55.19)).toBe("Dubai");
    expect(nearestZoneEmirate(toDesignModel(network).zones, 24.51, 54.41)).toBe("Abu Dhabi");
  });
  it("kpiView lifts verbatim fields and nulls what's missing", () => {
    const kpis = {
      cost_to_serve: { name: "cost_to_serve", value: 57.0949, unit: "AED/parcel",
        breakdown: { total_demand: 4283 } },
      spare_capacity: { name: "spare_capacity", value: 22667, unit: "parcels", breakdown: {} },
      utilization: { name: "utilization", value: 15.89, unit: "%", breakdown: {} },
      coverage: { name: "coverage", value: 100, unit: "%", breakdown: {} },
    } as unknown as KpisResponse;
    expect(kpiView(kpis)).toEqual({ deliver: 4283, room: 22667, cost: 57.0949 });
    const empty = kpiView({} as KpisResponse);
    expect(empty).toEqual({ deliver: null, room: null, cost: null });
  });
});
