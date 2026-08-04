/**
 * Corridor geometry for the transport-corridor layer: engine flows
 * (min-cost-flow solver output served by /network) → GeoJSON LineStrings.
 *
 * Selection only, no arithmetic: volumes pass through untouched. The one
 * judgment call is top-K per hub — 9 hubs × 100 zones is a hairball, so each
 * hub draws only its K busiest corridors (every volume is still real).
 */

import type { FlowMapInfo, HubMapInfo, ZoneMapInfo } from "./types";

/** The Main Magazine hub id — created as REAL model data via the add_hub
 *  scenario (saved scenario "main-magazine"), never invented client-side. */
export const MAGAZINE_HUB_ID = "MAGAZINE";

export type CorridorMode = "domestic" | "magazine";

export interface CorridorProperties {
  hub_id: string;
  zone_id: string;
  volume: number;
  magazine: boolean;
}

export interface CorridorFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: CorridorProperties;
}

export interface CorridorCollection {
  type: "FeatureCollection";
  features: CorridorFeature[];
}

export function buildCorridors(
  hubs: HubMapInfo[],
  zones: ZoneMapInfo[],
  flows: FlowMapInfo[],
  options: { mode: CorridorMode; topKPerHub?: number },
): CorridorCollection {
  const topK = options.topKPerHub ?? 5;
  const hubById = new Map(hubs.map((h) => [h.id, h]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const eligible = flows.filter((f) => {
    if (f.volume <= 0) return false;
    if (!hubById.has(f.hub_id) || !zoneById.has(f.zone_id)) return false;
    const isMagazine = f.hub_id === MAGAZINE_HUB_ID;
    return options.mode === "magazine" ? isMagazine : !isMagazine;
  });

  // Top-K busiest corridors per hub, busiest first.
  const byHub = new Map<string, FlowMapInfo[]>();
  for (const f of eligible) {
    const list = byHub.get(f.hub_id) ?? [];
    list.push(f);
    byHub.set(f.hub_id, list);
  }

  const features: CorridorFeature[] = [];
  for (const list of byHub.values()) {
    list.sort((a, b) => b.volume - a.volume);
    for (const f of list.slice(0, topK)) {
      const hub = hubById.get(f.hub_id)!;
      const zone = zoneById.get(f.zone_id)!;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [hub.lon, hub.lat],
            [zone.lon, zone.lat],
          ],
        },
        properties: {
          hub_id: f.hub_id,
          zone_id: f.zone_id,
          volume: f.volume,
          magazine: f.hub_id === MAGAZINE_HUB_ID,
        },
      });
    }
  }

  return { type: "FeatureCollection", features };
}
