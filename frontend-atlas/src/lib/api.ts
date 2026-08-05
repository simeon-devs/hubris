/**
 * The real engine's API client — the ONLY place figures may enter the app
 * from (the honesty rule: the browser formats numbers, it never computes
 * them). Every function returns exactly what the FastAPI backend returned.
 *
 * Base URL: VITE_API_URL at build time, else localhost:8000.
 */

export const API_URL: string =
  (import.meta.env?.VITE_API_URL as string | undefined) || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    signal: AbortSignal.timeout(timeoutMs),
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---- health ----------------------------------------------------------------
export function getHealth(): Promise<{ status: string }> {
  return request("/health", undefined, 4000);
}

// ---- network / kpis --------------------------------------------------------
export interface ApiHub {
  id: string; name: string; lat: number; lon: number; emirate: string;
  capacity: number; status: "open" | "closed" | "candidate";
  utilization_pct: number; assignment_share_pct: number;
  spare_capacity: number; cost_to_serve: number;
  hub_type: string | null; service_models: string[] | null;
  riders_fte: number | null; riders_ftc: number | null;
  rider_capacity_daily: number | null; rider_weekly_cost: number | null;
  required_headcount: number; sustainable_headcount: number;
  headcount_gap: number; gap_direction: string;
}
export interface ApiZone {
  id: string; name: string; lat: number; lon: number; emirate: string;
  demand: number; service_model: string | null;
}
export interface ApiFlow { hub_id: string; zone_id: string; volume: number }
export interface ApiNetwork {
  hubs: ApiHub[]; zones: ApiZone[]; flows: ApiFlow[];
  distance_mode: string; baseline_provenance: string;
}
export function getNetwork(scenarioId?: string | null): Promise<ApiNetwork> {
  const q = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/network${q}`, undefined, 15_000);
}

export interface MetricResult {
  name: string; value: number; unit: string;
  breakdown: Record<string, unknown> | null;
}
export interface ApiKpis {
  cost_to_serve: MetricResult; utilization: MetricResult; coverage: MetricResult;
  demand_served: MetricResult; spare_capacity: MetricResult;
  demand_by_emirate: MetricResult; courier_utilization: MetricResult;
  workforce_requirement: MetricResult;
  network_summary: {
    hub_count: number; open_hub_count: number; zone_count: number;
    emirate_count: number; total_demand: number; baseline_provenance: string;
  };
}
export function getKpis(scenarioId?: string | null): Promise<ApiKpis> {
  const q = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/kpis${q}`, undefined, 15_000);
}

// ---- simulate --------------------------------------------------------------
export interface KpiEntrySet { [metric: string]: { value: number; unit?: string } }
export interface ApiSimulateResponse {
  scenario_name: string; params: Record<string, unknown>;
  baseline_kpis: KpiEntrySet; scenario_kpis: KpiEntrySet;
  delta_pct: Record<string, number>;
  scenario_flow_feasible: boolean;
  scenario_id: string | null;
}
export function simulate(body: {
  scenario_name: string;
  params: Record<string, unknown>;
  base_scenario_id?: string | null;
  save_as?: string | null;
}): Promise<ApiSimulateResponse> {
  return request("/simulate", { method: "POST", body: JSON.stringify(body) }, 60_000);
}

// ---- optimize family -------------------------------------------------------
export interface ApiRobustness {
  demand_variation_pct: number; trials: number; feasible_pct: number;
  holds_under_variation: boolean; cost_to_serve_p10: number;
  cost_to_serve_p50: number; cost_to_serve_p90: number;
}
export interface ApiOptimizeResponse {
  changes: { action: string; hub_id: string }[];
  cost_to_serve_before: number; cost_to_serve_after: number;
  cost_to_serve_savings_per_parcel: number;
  total_cost_before: number; total_cost_after: number; total_cost_savings: number;
  delta_vs_baseline: Record<string, number>;
  robustness: ApiRobustness;
}
export function optimize(): Promise<ApiOptimizeResponse> {
  return request("/optimize", { method: "POST", body: "{}" }, 90_000);
}

export interface ApiCostPools {
  variable_only_aed_per_parcel: number; fully_loaded_aed_per_parcel: number;
  variable_target_aed: number; variable_vs_target_aed: number;
  meets_variable_target: boolean;
}
export interface ApiFrontierSide {
  objective_value: number; delta_vs_baseline_pct: number | null;
  cost_to_serve_after: number; cost_pools: ApiCostPools;
  changes: { action: string; hub_id: string }[];
  hubs_open: string[]; hubs_open_count: number;
  volume_share_by_hub: Record<string, number>;
  constraints_enforced: boolean;
}
export interface ApiFrontier {
  baseline: { cost_to_serve: number; total_cost: number; cost_pools: ApiCostPools; hubs_open_count: number };
  unconstrained: ApiFrontierSide; constrained: ApiFrontierSide;
  resilience_premium: { total_cost_delta: number; pct_points_of_saving_given_up: number | null };
  params: { min_hubs_per_emirate: number; max_hub_volume_share: number };
}
export function optimizeFrontier(body: {
  min_hubs_per_emirate?: number; max_hub_volume_share?: number;
}): Promise<ApiFrontier> {
  return request("/optimize/frontier", { method: "POST", body: JSON.stringify(body) }, 60_000);
}

export interface ApiRankedShape {
  rank: number; label: string; opens: string[]; closes: string[];
  hubs_open: number; cps: number; aed_day: number; save_aed_month: number;
  stress_safe_pct: number; feasible: boolean;
  is_current: boolean; is_recommended: boolean;
}
export function getRankedShapes(limit = 8): Promise<{
  shapes: ApiRankedShape[]; evaluated: number; feasible_count: number; baseline_cps: number;
}> {
  return request(`/optimize/ranked-shapes?limit=${limit}`, undefined, 60_000);
}

export interface ApiThreshold {
  threshold_found: boolean; hub_id?: string; growth_pct_threshold?: number;
  growth_factor_threshold?: number; hub_utilization_pct?: number; reason?: string;
}
export function getDemandGrowthBreak(hubId: string): Promise<ApiThreshold> {
  return request(`/threshold/demand-growth?hub_id=${encodeURIComponent(hubId)}`, undefined, 60_000);
}

export interface ApiBottleneck {
  bottleneck_found: boolean; why?: string; reason?: string;
  recommendation?: Record<string, unknown>;
}
export function getBottleneck(scenarioId?: string | null): Promise<ApiBottleneck> {
  const q = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/bottleneck${q}`, undefined, 60_000);
}

// ---- chat (the accuracy-critical surface) ----------------------------------
export interface ApiToolCall { tool: string; args: Record<string, unknown>; result: unknown }
export interface ApiVerification {
  status: "verified" | "regenerated" | "flagged";
  untraceable_figures: number[]; attempts: number; checked_against: string[];
}
export interface ApiAgentResponse {
  answer: string; tool_calls: ApiToolCall[]; verification: ApiVerification;
  role: string | null; agent_name: string | null;
}
export function queryAgent(question: string, scenarioId?: string | null): Promise<ApiAgentResponse> {
  return request(
    "/agent/query",
    { method: "POST", body: JSON.stringify({ question, scenario_id: scenarioId ?? null }) },
    120_000,
  );
}

// ---- alerts ----------------------------------------------------------------
export interface ApiAlert {
  id: string; agent_name: string; severity: "critical" | "warning";
  finding: {
    target: string; stress_factor: number | null; feasible: boolean;
    unmet_demand: Record<string, number>; hottest_hub: string | null;
    hottest_utilization_pct: number; hot_threshold_pct: number;
  };
  recommended_action: {
    action: string; detail: Record<string, unknown> | string;
    // "restore_feasibility" (serves dropped demand, costs money) vs
    // "reduce_cost" (a cheaper reroute). Absent on older alert rows.
    kind?: "restore_feasibility" | "reduce_cost";
    why?: string; source_tool: string;
  };
  brief_link: string; acknowledged: boolean; provenance: string; created_at: string;
}
export function getAlerts(): Promise<ApiAlert[]> {
  return request<{ available: boolean; alerts: ApiAlert[] }>("/memory/alerts", undefined, 10_000).then(
    (envelope) => (envelope.available ? envelope.alerts : []),
  );
}
export function acknowledgeAlert(id: string): Promise<void> {
  return request(`/memory/alerts/${encodeURIComponent(id)}/ack`, { method: "POST" });
}

// ---- event metrics (the file's own official figures, verbatim) -------------
export interface ApiEventMetrics {
  week: number; hub_count: number;
  hubs: Record<string, {
    courier_utilisation_pct: number; on_time_delivery_pct: number;
    capacity_headroom_pct: number; sla_breach_count: number;
    avg_delivery_time_min: number; status: string;
  }>;
  at_risk: string[]; at_risk_count: number;
  cost_per_shipment: Record<string, number>;
  network_volumes: Record<string, number>;
  weekly_hub_spoke_daily: { week: number; daily_volume: number }[];
}
export function getEventMetrics(): Promise<ApiEventMetrics> {
  return request("/event/metrics", undefined, 15_000);
}

// ---- saved scenarios / exports --------------------------------------------
export function listSavedScenarios(): Promise<{ id: string; label: string }[]> {
  return request("/scenarios/saved");
}
export function exportUrl(path: string): string {
  return `${API_URL}${path}`;
}
