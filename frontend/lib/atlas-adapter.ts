/**
 * atlas-adapter — API → the AtlasVision design's data model.
 *
 * Pure renames, comparisons, and DECORATIVE geometry. The one derived figure,
 * `load = (utilization_pct/100) * capacity`, is prescribed verbatim by the
 * integration spec (Phase 1) and is flagged as such wherever it is shown.
 * Every other displayed number is an API field untouched.
 */

import type { HubMapInfo, KpisResponse, NetworkMapResponse, ZoneMapInfo } from "./types";

export interface DesignHub {
  id: string;
  name: string;
  lat: number;
  lon: number;
  cap: number; // capacity
  busy: number; // utilization_pct, verbatim
  couriers: number; // required_headcount, verbatim
  load: number; // spec-prescribed display load
  emirate: string;
  card: boolean;
  off: [number, number] | null;
}

export interface DesignZone {
  id: string;
  lon: number;
  lat: number;
  load: number; // demand, verbatim
  emirate: string;
  hubId: string | null; // dominant hub from the flows
}

export interface DesignDot {
  lon: number;
  lat: number;
  s: number; // decorative size seed
  hubId: string | null;
}

export interface DesignModel {
  hubs: DesignHub[];
  zones: DesignZone[];
  dots: DesignDot[];
}

/** The prototype's card anchor offsets, cycled over the 4 carded hubs. */
const CARD_OFFSETS: [number, number][] = [
  [-150, -70],
  [150, -92],
  [-120, -46],
  [128, -62],
];

export function toDesignModel(network: NetworkMapResponse): DesignModel {
  // Dominant hub per zone — highest flow volume (comparison, not arithmetic).
  const dominant = new Map<string, { hubId: string; volume: number }>();
  for (const flow of network.flows) {
    const current = dominant.get(flow.zone_id);
    if (!current || flow.volume > current.volume) {
      dominant.set(flow.zone_id, { hubId: flow.hub_id, volume: flow.volume });
    }
  }

  const openHubs = network.hubs.filter((h) => h.status === "open");
  const byLoad = [...openHubs].sort(
    (a, b) => displayLoad(b) - displayLoad(a),
  );
  const carded = new Set(byLoad.slice(0, 4).map((h) => h.id));
  let offIndex = 0;

  const hubs: DesignHub[] = openHubs.map((h) => {
    const card = carded.has(h.id);
    return {
      id: h.id,
      name: h.name,
      lat: h.lat,
      lon: h.lon,
      cap: h.capacity,
      busy: h.utilization_pct,
      couriers: h.required_headcount ?? 0,
      load: displayLoad(h),
      emirate: h.emirate,
      card,
      off: card ? CARD_OFFSETS[offIndex++ % CARD_OFFSETS.length] : null,
    };
  });

  const zones: DesignZone[] = network.zones.map((z: ZoneMapInfo) => ({
    id: z.id,
    lon: z.lon,
    lat: z.lat,
    load: z.demand,
    emirate: z.emirate,
    hubId: dominant.get(z.id)?.hubId ?? null,
  }));

  return { hubs, zones, dots: densityDots(zones) };
}

function displayLoad(h: HubMapInfo): number {
  return (h.utilization_pct / 100) * h.capacity;
}

/* ── Camera auto-fit — frame whatever the real dataset covers ─────────── */

const FALLBACK_CAMERA = { lon: 55.05, lat: 24.92, zoom: 215 }; // the prototype's UAE
const ZOOM_MIN = 80;
const ZOOM_MAX = 420;

export function autoFitCamera(
  model: Pick<DesignModel, "hubs" | "zones">,
  width: number,
  height: number,
): { lon: number; lat: number; zoom: number } {
  const lons = [...model.hubs.map((h) => h.lon), ...model.zones.map((z) => z.lon)];
  const lats = [...model.hubs.map((h) => h.lat), ...model.zones.map((z) => z.lat)];
  if (lons.length === 0) return { ...FALLBACK_CAMERA };

  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const spanLon = Math.max(0.2, maxLon - minLon);
  const spanLat = Math.max(0.2, maxLat - minLat);

  // The design projects x = dLon*zoom, y = dLat*zoom*0.92 (then tilts) —
  // pick the zoom that fits the box into ~62% of the viewport.
  const zoom = Math.max(
    ZOOM_MIN,
    Math.min(ZOOM_MAX, Math.min((width * 0.62) / spanLon, (height * 0.55) / (spanLat * 0.92))),
  );

  return { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2, zoom };
}

/* ── Decorative density scaling — the "demand cloud" must survive ─────── */

const DENSITY_THRESHOLD = 150;

/** Deterministic LCG, same constants as the prototype (seed 7). */
function makeRnd(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function densityDots(zones: DesignZone[]): DesignDot[] {
  const rnd = makeRnd();
  const dots: DesignDot[] = [];
  const dense = zones.length >= DENSITY_THRESHOLD;

  for (const zone of zones) {
    const count = dense ? 1 : 3 + Math.round(rnd() * 2); // 3–5 jittered per zone
    for (let i = 0; i < count; i++) {
      const angle = rnd() * Math.PI * 2;
      const radius = dense ? 0.004 : 0.015 + rnd() * 0.05;
      dots.push({
        lon: zone.lon + Math.cos(angle) * radius * 1.25,
        lat: zone.lat + Math.sin(angle) * radius * 0.8,
        s: 0.6 + rnd() * 1.5,
        hubId: zone.hubId,
      });
    }
  }
  return dots;
}

/* ── Small helpers for the add-hub defaults ───────────────────────────── */

export function medianCapacity(hubs: DesignHub[]): number {
  if (hubs.length === 0) return 1000;
  const sorted = [...hubs].sort((a, b) => a.cap - b.cap);
  return sorted[Math.floor(sorted.length / 2)].cap;
}

export function nearestZoneEmirate(zones: DesignZone[], lat: number, lon: number): string {
  let best = zones[0]?.emirate ?? "Dubai";
  let bestD = Infinity;
  for (const z of zones) {
    const d = (z.lon - lon) ** 2 + ((z.lat - lat) * 0.92) ** 2;
    if (d < bestD) {
      bestD = d;
      best = z.emirate;
    }
  }
  return best;
}

/* ── KPI tiles — verbatim fields; null when the API lacks the field ───── */

export interface KpiViewModel {
  deliver: number | null; // cost_to_serve.breakdown.total_demand
  room: number | null; // spare_capacity.value
  cost: number | null; // cost_to_serve.value
}

export function kpiView(kpis: KpisResponse): KpiViewModel {
  const bag = kpis as unknown as Record<
    string,
    { value?: unknown; breakdown?: Record<string, unknown> } | undefined
  >;
  const costMetric = bag.cost_to_serve;
  const spareMetric = bag.spare_capacity;
  const totalDemand = costMetric?.breakdown?.total_demand;
  return {
    deliver: typeof totalDemand === "number" ? totalDemand : null,
    room: typeof spareMetric?.value === "number" ? (spareMetric.value as number) : null,
    cost: typeof costMetric?.value === "number" ? (costMetric.value as number) : null,
  };
}
