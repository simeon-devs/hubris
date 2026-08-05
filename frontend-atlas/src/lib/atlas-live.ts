/**
 * atlas-live — the REAL engine behind the simulate workspace.
 *
 * Replaces atlas-engine's in-browser solver for every scenario run: each
 * function POSTs to /simulate with save_as, then fetches the saved
 * scenario's /network (the engine's actual re-routed flows) and adapts it
 * into the ScenarioRun shape the workspace/map already render. Nothing is
 * computed here beyond joining rows the API returned; every displayed
 * figure is an engine output.
 */

import {
  getKpis,
  getNetwork,
  simulate,
  type ApiKpis,
  type ApiNetwork,
  type ApiSimulateResponse,
  type ApiZone,
} from "@/lib/api";
import type { EngineTotals, HsComputation, ScenarioRun, SimulateResponse } from "@/lib/atlas-engine";

let runCounter = 0;
function nextScenarioId(prefix: string): string {
  runCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${runCounter}`;
}

/** "Al Quoz · Express (Dubai)" -> {zone: "Al Quoz", model: "Express"};
 *  QComm/generic names fall back to the zone's service_model field. */
function parseZoneName(zone: ApiZone): { zone: string; model: string } {
  const withoutEmirate = zone.name.replace(/\s*\([^)]*\)\s*$/, "");
  const parts = withoutEmirate.split(" · ");
  if (parts.length === 2) return { zone: parts[0]!, model: parts[1]! };
  return { zone: withoutEmirate, model: zone.service_model ?? "Standard" };
}

/** Adapt a real /network payload into the HsComputation shape the map
 *  renders. Weekly figures are the engine's daily volumes x 7 (display
 *  convention carried over from the dataset's weekly panels). */
function toComputation(net: ApiNetwork, res: ApiSimulateResponse | null): HsComputation {
  const zoneById = new Map(net.zones.map((z) => [z.id, z]));
  const assignments = net.flows
    .map((f) => {
      const zone = zoneById.get(f.zone_id);
      if (!zone) return null;
      const parsed = parseZoneName(zone);
      return {
        zone: parsed.zone,
        emirate: zone.emirate,
        model: parsed.model,
        weekly: f.volume * 7,
        hubId: f.hub_id,
        distKm: 0, // not displayed on the sim map; corridor detail = /route-cost
        lat: zone.lat,
        lng: zone.lon,
      };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const volumeByHub = new Map<string, number>();
  for (const f of net.flows) {
    volumeByHub.set(f.hub_id, (volumeByHub.get(f.hub_id) ?? 0) + f.volume);
  }

  const hubs = net.hubs
    .filter((h) => h.status === "open")
    .map((h) => ({
      id: h.id,
      name: h.name,
      daily: volumeByHub.get(h.id) ?? 0, // grouped engine flow rows (presentation)
      util: h.utilization_pct,
      overloadDaily: 0,
      spareDaily: h.spare_capacity,
      avgDistKm: 0,
      monthlyShipments: 0,
      monthlyCost: 0,
      monthlyVar: 0,
      monthlyFixed: 0,
      cps: h.cost_to_serve,
      // Live extras straight off /network — resize and right-size-riders
      // tiles read these (null -> undefined, e.g. hubs with no roster).
      capacity: h.capacity,
      ridersFte: h.riders_fte ?? undefined,
      ridersFtc: h.riders_ftc ?? undefined,
      riderCapacityDaily: h.rider_capacity_daily ?? undefined,
      riderWeeklyCost: h.rider_weekly_cost ?? undefined,
    }));

  const kpis = res
    ? res.scenario_kpis
    : Object.fromEntries(
        ["cost_to_serve", "utilization", "coverage", "spare_capacity"].map((k) => [k, { value: 0 }]),
      );

  return {
    assignments,
    hubs,
    kpis: kpis as HsComputation["kpis"],
    feasible: res ? res.scenario_flow_feasible : true,
    moves: [],
  } as HsComputation;
}

function toSimResponse(res: ApiSimulateResponse, scenarioId: string): SimulateResponse {
  const pick = (set: Record<string, { value: number }>, key: string) => ({
    value: set[key]?.value ?? 0,
  });
  const kpis = (set: Record<string, { value: number }>) => ({
    cost_to_serve: pick(set, "cost_to_serve"),
    utilization: pick(set, "utilization"),
    // The workspace's "Served" tile now reads the honest quantity —
    // demand_served (capacity-constrained), NOT coverage (reachability).
    coverage: pick(set, "demand_served"),
    spare_capacity: pick(set, "spare_capacity"),
  });
  return {
    baseline_kpis: kpis(res.baseline_kpis),
    scenario_kpis: kpis(res.scenario_kpis),
    delta_pct: {
      cost_to_serve: res.delta_pct.cost_to_serve ?? 0,
      utilization: res.delta_pct.utilization ?? 0,
      coverage: res.delta_pct.demand_served ?? 0,
      spare_capacity: res.delta_pct.spare_capacity ?? 0,
    },
    scenario_flow_feasible: res.scenario_flow_feasible,
    scenario_id: scenarioId,
    reasoning: [
      `Engine re-solve: ${res.scenario_name} with ${JSON.stringify(res.params)}.`,
      res.scenario_flow_feasible
        ? "Every parcel is served in the re-solved flow."
        : "The re-solved flow CANNOT serve all demand — see the red zones.",
    ],
  };
}

export interface LiveRunExtras {
  closedId?: string;
  touchedId?: string;
  newHub?: { id: string; name: string; lat: number; lng: number; maxDaily: number; kind: "full" | "micro" | "darkstore" };
}

/** The engine's own cost decomposition, verbatim from /kpis breakdown. */
function toTotals(kpis: ApiKpis): EngineTotals {
  const b = (kpis.cost_to_serve.breakdown ?? {}) as Record<string, unknown>;
  const num = (key: string) => (typeof b[key] === "number" ? (b[key] as number) : 0);
  return {
    totalCost: num("total_cost"),
    totalDemand: num("total_demand"),
    transportCost: num("transport_cost"),
    fixedCost: num("fixed_cost"),
  };
}

async function liveRun(
  prefix: string,
  scenarioName: string,
  params: Record<string, unknown>,
  extras: LiveRunExtras = {},
): Promise<ScenarioRun> {
  const scenarioId = nextScenarioId(prefix);
  const res = await simulate({ scenario_name: scenarioName, params, save_as: scenarioId });
  const [baseNet, scenNet, baseKpis, scenKpis] = await Promise.all([
    getNetwork(),
    getNetwork(scenarioId),
    getKpis(),
    getKpis(scenarioId),
  ]);
  const run: ScenarioRun = {
    res: toSimResponse(res, scenarioId),
    baseline: toComputation(baseNet, null),
    scenario: toComputation(scenNet, res),
    totals: { baseline: toTotals(baseKpis), scenario: toTotals(scenKpis) },
    ...extras,
  } as ScenarioRun;
  return run;
}

// ---- the nine scenarios, real ---------------------------------------------
export function liveCloseHub(hubId: string): Promise<ScenarioRun> {
  return liveRun("close", "close_hub", { hub_id: hubId }, { closedId: hubId });
}

/** Absorb: the micro CLOSES and its capacity + rider roster MOVE into the
 *  absorber (backend absorb_hub). touchedId = the absorbing hub, resolved
 *  from the engine's own output when the engine picked it (capacity grew). */
export async function liveAbsorbHub(microId: string, intoId?: string): Promise<ScenarioRun> {
  const params: Record<string, unknown> = intoId
    ? { micro_id: microId, into_id: intoId }
    : { micro_id: microId };
  const run = await liveRun("absorb", "absorb_hub", params, { closedId: microId });
  const baseCap = new Map(run.baseline.hubs.map((h) => [h.id, h.capacity ?? 0]));
  const grew = run.scenario.hubs.find((h) => (h.capacity ?? 0) > (baseCap.get(h.id) ?? 0) + 0.001);
  return { ...run, touchedId: intoId ?? grew?.id };
}

export function liveCustomHub(hub: {
  id: string; name: string; lat: number; lng: number; maxDaily: number;
  kind: "full" | "micro" | "darkstore"; emirate: string;
  fixedCost: number; handlingCost: number;
}): Promise<ScenarioRun> {
  const serviceModels =
    hub.kind === "full" ? ["Standard", "Express"] : hub.kind === "micro" ? ["Standard"] : ["QComm"];
  return liveRun(
    "open",
    "add_hub",
    {
      id: hub.id,
      name: hub.name,
      lat: hub.lat,
      lon: hub.lng,
      emirate: hub.emirate,
      capacity: hub.maxDaily,
      fixed_cost: hub.fixedCost,
      handling_cost: hub.handlingCost,
      hub_type: hub.kind === "full" ? "Full Hub" : hub.kind === "micro" ? "Micro Hub" : "Dark Store",
      service_models: serviceModels,
    },
    { newHub: { id: hub.id, name: hub.name, lat: hub.lat, lng: hub.lng, maxDaily: hub.maxDaily, kind: hub.kind } },
  );
}

export function liveResizeHub(hubId: string, newCapacity: number): Promise<ScenarioRun> {
  return liveRun(
    "resize",
    "change_hub_capacity",
    { hub_id: hubId, new_capacity: newCapacity },
    { touchedId: hubId },
  );
}

export function liveSameDaySurge(pct: number): Promise<ScenarioRun> {
  return liveRun("surge", "demand_scale", { factor: 1 + pct / 100, service_model: "Express" });
}

export function liveShiftToNextDay(pct: number): Promise<ScenarioRun> {
  return liveRun("shift", "shift_service_mix", { pct });
}

export function liveRiders(hubId: string, fteDelta: number, ftcDelta: number): Promise<ScenarioRun> {
  return liveRun(
    "riders",
    "change_workforce",
    { hub_id: hubId, fte_delta: fteDelta, ftc_delta: ftcDelta },
    { touchedId: hubId },
  );
}

export function liveDemandScale(factor: number): Promise<ScenarioRun> {
  return liveRun("demand", "demand_scale", { factor });
}

export function liveAddCustomer(params: {
  name: string; lat: number; lng: number; emirate: string;
  dailyVolume: number; slaHours: number;
}): Promise<ScenarioRun> {
  return liveRun("customer", "add_customer", {
    id: `CUST-${Date.now().toString(36)}`,
    name: params.name,
    lat: params.lat,
    lon: params.lng,
    emirate: params.emirate,
    demand: params.dailyVolume,
    sla_hours: params.slaHours,
  });
}
