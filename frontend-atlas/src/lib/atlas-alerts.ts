/**
 * EMX ATLAS — the alert feed, REAL. Every card is a computed finding from
 * the backend watchdog (T-40): a real stress simulation ran on its own
 * schedule, the figures are solver output with provenance, and the
 * recommended action was verified by re-solving. This module only adapts
 * the API's structured finding into the card copy — labels around
 * verbatim engine numbers, nothing computed here.
 */

import { acknowledgeAlert, getAlerts, type ApiAlert } from "@/lib/api";
import { DARK_STORES, HUBS, OD_NETWORK } from "./atlas-data";

export interface AlertTarget {
  lat: number;
  lng: number;
  zoom?: number;
  label: string;
}

export interface AtlasAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  finding: string;
  action: string;
  target?: AlertTarget | undefined;
  acknowledged: boolean;
  provenance: string;
  createdAt: string;
}

/** "Abu_Dhabi-Al_Reem" -> the dark store / hub sitting in that zone — the
 *  point of CONCERN, so Show-on-map lands on the shortfall, not the
 *  busiest facility. */
function targetForZone(zoneId: string): AlertTarget | undefined {
  const zoneName = (zoneId.split("-")[1] ?? "").replace(/_/g, " ").trim();
  if (!zoneName) return undefined;
  const store = DARK_STORES.find((s) => s.zone.toLowerCase().includes(zoneName.toLowerCase()));
  if (store) return { lat: store.lat, lng: store.lng, zoom: 12, label: `Unserved: ${zoneName}` };
  const hub = HUBS.find((h) => h.zone.toLowerCase().includes(zoneName.toLowerCase()));
  if (hub) return { lat: hub.lat, lng: hub.lng, zoom: 12, label: `Unserved: ${zoneName}` };
  return undefined;
}

function targetFor(id: string): AlertTarget | undefined {
  const hub = HUBS.find((h) => h.id === id);
  if (hub) return { lat: hub.lat, lng: hub.lng, zoom: 11, label: hub.name };
  const store = DARK_STORES.find((s) => s.id === id);
  if (store) return { lat: store.lat, lng: store.lng, zoom: 12, label: store.name };
  const od = OD_NETWORK.find((o) => o.id === id);
  if (od) return { lat: od.lat, lng: od.lng, zoom: 10, label: `${od.emirate} On-Demand` };
  return undefined;
}

function findingSentence(alert: ApiAlert): string {
  const f = alert.finding;
  if (!f.feasible) {
    const unmet = Object.entries(f.unmet_demand)
      .map(([zone, qty]) => `${zone.replace(/_/g, " ")} — ${qty}/day unserved`)
      .join("; ");
    return `The re-solved flow CANNOT serve all demand on ${f.target}: ${unmet}.`;
  }
  return `${f.hottest_hub ?? "A facility"} runs at ${f.hottest_utilization_pct}% — above the ${f.hot_threshold_pct}% line (target: ${f.target}${f.stress_factor ? `, stressed x${f.stress_factor}` : ""}).`;
}

function actionSentence(alert: ApiAlert): string {
  const action = alert.recommended_action;
  if (action.action === "add_capacity" && typeof action.detail === "object" && action.detail) {
    const d = action.detail as { hub_id?: string; unlock_units?: number; verified_cost_savings?: number };
    const saving =
      typeof d.verified_cost_savings === "number"
        ? ` — saves ${d.verified_cost_savings} AED/period, verified by re-solving`
        : "";
    if (d.hub_id && typeof d.unlock_units === "number") {
      return `Add ${d.unlock_units} units of capacity at ${d.hub_id}${saving}.`;
    }
  }
  if (action.action === "review_robustness") return "Review the robustness band before committing to this load.";
  return action.action.replace(/_/g, " ");
}

/** Fetch + adapt the watchdog's alerts. Degrades to [] (never throws). */
export async function fetchAlerts(): Promise<AtlasAlert[]> {
  try {
    const alerts = await getAlerts();
    return alerts.map((a) => ({
      id: a.id,
      severity: a.severity,
      title: a.finding.feasible
        ? `${a.finding.hottest_hub ?? a.finding.target} running hot`
        : `${a.finding.target}: cannot serve all demand`,
      finding: findingSentence(a),
      action: actionSentence(a),
      target:
        (!a.finding.feasible
          ? targetForZone(Object.keys(a.finding.unmet_demand)[0] ?? "")
          : undefined) ??
        targetFor(a.finding.hottest_hub ?? "") ??
        undefined,
      acknowledged: a.acknowledged,
      provenance: a.provenance,
      createdAt: a.created_at,
    }));
  } catch {
    return []; // engine offline -> quiet bell, never a broken panel
  }
}

/** Server-side acknowledge; swallow failures (the optimistic local ack
 *  in atlas-store keeps the UI responsive either way). */
export function ackAlertRemote(id: string): void {
  acknowledgeAlert(id).catch(() => {});
}
