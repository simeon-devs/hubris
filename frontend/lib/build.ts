/**
 * Build-mode state machine shared by page.tsx, BuildToolbar and NetworkMap.
 *
 * Pure selection/plumbing — INPUT defaults for the confirm card come from
 * the network's own data (medians of existing hubs/zones), which is form
 * pre-filling, not a displayed metric: every figure the UI *reports* still
 * comes from the engine.
 */

import type { HubMapInfo, NetworkMapResponse, ZoneMapInfo } from "./types";

export type BuildMode = "add_hub" | "add_customer" | "move_hub";

export interface BuildPickLocation {
  kind: "location";
  lat: number;
  lon: number;
}

export interface BuildPickHub {
  kind: "hub";
  hubId: string;
}

export type BuildPick = BuildPickLocation | BuildPickHub;

/** A fully-specified pending action, ready for the confirm card. */
export interface PendingBuild {
  mode: BuildMode;
  lat: number;
  lon: number;
  hubId?: string; // move_hub only
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Nearest emirate by zone proximity — a geometric DEFAULT for the emirate
 *  dropdown, freely overridable by the user. */
export function nearestEmirate(zones: ZoneMapInfo[], lat: number, lon: number): string {
  let best = zones[0]?.emirate ?? "Dubai";
  let bestD = Infinity;
  for (const z of zones) {
    const d = (z.lat - lat) ** 2 + (z.lon - lon) ** 2;
    if (d < bestD) {
      bestD = d;
      best = z.emirate;
    }
  }
  return best;
}

export function nextHubId(hubs: HubMapInfo[]): string {
  let n = 1;
  const ids = new Set(hubs.map((h) => h.id));
  while (ids.has(`NEW-H${n}`)) n += 1;
  return `NEW-H${n}`;
}

export function nextCustomerId(zones: ZoneMapInfo[]): string {
  let n = 1;
  const ids = new Set(zones.map((z) => z.id));
  while (ids.has(`NEW-C${n}`)) n += 1;
  return `NEW-C${n}`;
}

export interface AddHubDefaults {
  id: string;
  name: string;
  emirate: string;
  capacity: number;
  fixed_cost: number;
  handling_cost: number;
}

export interface AddCustomerDefaults {
  id: string;
  name: string;
  emirate: string;
  demand: number;
  sla_hours: number;
}

export function addHubDefaults(network: NetworkMapResponse, lat: number, lon: number): AddHubDefaults {
  const open = network.hubs.filter((h) => h.status === "open");
  const id = nextHubId(network.hubs);
  return {
    id,
    name: `New Hub ${id.replace("NEW-H", "")}`,
    emirate: nearestEmirate(network.zones, lat, lon),
    capacity: Math.round(median(open.map((h) => h.capacity))) || 1000,
    // Form defaults only — the user can change them, and the engine prices
    // the actual scenario. (HubMapInfo doesn't expose fixed/handling cost.)
    fixed_cost: 1000,
    handling_cost: 1.0,
  };
}

export function addCustomerDefaults(
  network: NetworkMapResponse,
  lat: number,
  lon: number
): AddCustomerDefaults {
  const id = nextCustomerId(network.zones);
  return {
    id,
    name: `New Customer ${id.replace("NEW-C", "")}`,
    emirate: nearestEmirate(network.zones, lat, lon),
    demand: Math.round(median(network.zones.map((z) => z.demand))) || 100,
    sla_hours: 24,
  };
}

/** Short auto-ID for a saved what-if, unique against existing ones. */
export function nextScenarioId(existing: string[], prefix: string): string {
  let n = 1;
  const ids = new Set(existing);
  while (ids.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}
