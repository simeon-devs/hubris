/**
 * EMX ATLAS — alert feed. Every alert is derived from the embedded official dataset
 * (Network_Performance, Cost_to_Serve, Demand_by_Zone) and the optimiser output.
 */

import {
  COST_TO_SERVE,
  DARK_STORES,
  DEMAND,
  HUBS,
  OD_NETWORK,
  entityName,
  perfOf,
} from "./atlas-data";
import { optimizeNetwork, predictedBreaks } from "./atlas-engine";

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
}

const w13 = (arr: number[]): number => arr[12] ?? 0;

function targetFor(id: string): AlertTarget | undefined {
  const hub = HUBS.find((h) => h.id === id);
  if (hub) return { lat: hub.lat, lng: hub.lng, zoom: 11, label: hub.name };
  const store = DARK_STORES.find((s) => s.id === id);
  if (store) return { lat: store.lat, lng: store.lng, zoom: 12, label: store.name };
  const od = OD_NETWORK.find((o) => o.id === id);
  if (od) return { lat: od.lat, lng: od.lng, zoom: 10, label: `${od.emirate} On-Demand` };
  return undefined;
}

export function currentAlerts(): AtlasAlert[] {
  const alerts: AtlasAlert[] = [];

  // 1 · Tightest capacity point in the network
  const breaks = predictedBreaks(26);
  const first = breaks[0];
  if (first) {
    const perf = perfOf(first.id);
    alerts.push({
      id: "first-break",
      severity: "critical",
      title: `${first.name} saturates in ~${first.weeks} weeks`,
      finding: `Compounding its zones' growth, ${first.name} crosses 100% courier utilisation first — currently ${perf ? w13(perf.util).toFixed(1) : "—"}% with ${perf ? w13(perf.headroom).toFixed(1) : "—"}% headroom and ${perf ? Math.round(w13(perf.breaches)) : 0} SLA breaches in week 13.`,
      action: "Hire FTC couriers (on-boarded in 5–10 days) or open the nearest candidate hub before the break date.",
      target: targetFor(first.id),
    });
  }

  // 2 · Dark stores missing the 15-minute promise
  for (const s of DARK_STORES) {
    const p = perfOf(s.id);
    if (p && (p.avgMinW13 ?? 0) > s.targetMin) {
      alerts.push({
        id: `qcomm-${s.id}`,
        severity: "warning",
        title: `${s.name} misses the ${s.targetMin}-minute promise`,
        finding: `Average delivery time is ${p.avgMinW13?.toFixed(1)} min against a ${s.targetMin}-minute target, with ${Math.round(w13(p.breaches))} time breaches in week 13 at ${w13(p.util).toFixed(1)}% rider utilisation.`,
        action: "Add bike couriers on the evening shift or rebalance catchment with the nearest dark store.",
        target: targetFor(s.id),
      });
    }
  }

  // 3 · Costliest lane in the network
  const costliest = [...COST_TO_SERVE].sort((a, b) => b.cps - a.cps)[0];
  if (costliest) {
    alerts.push({
      id: "costliest-lane",
      severity: "warning",
      title: `${entityName(costliest.id)} is the costliest lane`,
      finding: `${costliest.cps.toFixed(2)} AED per ${costliest.model} shipment — ${(costliest.overhead / costliest.total * 100).toFixed(0)}% of that is rent-driven overhead spread over only ${costliest.monthlyShipments.toLocaleString("en-US")} shipments/month at ${costliest.avgDistKm} km average distance.`,
      action: "Test absorbing this hub's zones into the nearest full hub, or grow volume to dilute the overhead.",
      target: targetFor(costliest.id),
    });
  }

  // 4 · Demand migration: Standard → QComm
  const hsRows = DEMAND.filter((d) => d.network === "Hub & Spoke" && d.model === "Standard");
  const declining = hsRows.filter((d) => d.growthPct <= -30);
  if (declining.length > 0) {
    const worst = [...declining].sort((a, b) => a.growthPct - b.growthPct)[0]!;
    alerts.push({
      id: "demand-migration",
      severity: "info",
      title: `Same-day demand is migrating to QComm`,
      finding: `${declining.length} Standard lanes are shrinking faster than 30% over the 13 weeks — steepest: ${worst.zone}, ${worst.emirate} at ${worst.growthPct}%. QComm zones grow +14% everywhere.`,
      action: "Shift same-day volume onto next-day where the promise allows it, and re-balance courier waves toward QComm catchments.",
      target: worst ? targetFor(worst.servingId) : undefined,
    });
  }

  // 5 · Money left on the table
  const opt = optimizeNetwork();
  if (opt.changes.length > 0 && opt.cost_to_serve_after < opt.cost_to_serve_before) {
    const hub = HUBS.find((h) => h.id === opt.changes[0]?.hub_id);
    alerts.push({
      id: "optimizer-opening",
      severity: "info",
      title: `Optimiser found a cheaper network shape`,
      finding: `${opt.changes.map((c) => `${c.action} ${entityName(c.hub_id)}`).join(" + ")} takes cost per shipment from ${opt.cost_to_serve_before.toFixed(2)} → ${opt.cost_to_serve_after.toFixed(2)} AED and stays feasible in ${opt.robustness.feasible_pct.toFixed(0)}% of ±20% demand stress tests.`,
      action: "Open the Optimize page to adopt the recommendation.",
      target: hub ? targetFor(hub.id) : undefined,
    });
  }

  return alerts;
}
