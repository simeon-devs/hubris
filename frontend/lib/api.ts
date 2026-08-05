// Thin fetch wrapper over the FastAPI backend (T-15). Every function here
// returns exactly what the API returned — no client-side computation of
// any figure the UI displays (the honesty rule: numbers come from the
// engine, never from the browser).

import type {
  AgentQueryRequest,
  AgentQueryResponse,
  AgentSpec,
  AlertInfo,
  BottleneckResponse,
  CustomerCountBreakResponse,
  DecisionBrief,
  DemandGrowthBreakResponse,
  IngestResponse,
  KpisResponse,
  NetworkMapResponse,
  OpportunitiesResponse,
  OptimizeRequest,
  OptimizeResponse,
  RefreshDistancesResponse,
  RouteCostResponse,
  SavedScenarioInfo,
  ScenarioModuleInfo,
  SimulateRequest,
  SimulateResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// A hung socket (flaky localhost relay) must surface as an error the UI can
// show — never an invisible forever-pending await (seen live via Playwright).
const REQUEST_TIMEOUT_MS = 30_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getKpis(scenarioId?: string | null): Promise<KpisResponse> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/kpis${query}`);
}

export function getNetwork(scenarioId?: string | null): Promise<NetworkMapResponse> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/network${query}`);
}

export function refreshDistances(): Promise<RefreshDistancesResponse> {
  return request("/network/refresh-distances", { method: "POST" });
}

export function getRouteCost(
  fromHub: string,
  toZone: string,
  scenarioId?: string | null
): Promise<RouteCostResponse> {
  const scenario = scenarioId ? `&scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(
    `/route-cost?from_hub=${encodeURIComponent(fromHub)}&to_zone=${encodeURIComponent(toZone)}${scenario}`
  );
}

export function getOpportunities(scenarioId?: string | null): Promise<OpportunitiesResponse> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/opportunities${query}`);
}

export function getDemandGrowthBreak(
  hubId: string,
  scenarioId?: string | null
): Promise<DemandGrowthBreakResponse> {
  const scenario = scenarioId ? `&scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/threshold/demand-growth?hub_id=${encodeURIComponent(hubId)}${scenario}`);
}

export function getCustomerCountBreak(
  emirate: string,
  scenarioId?: string | null
): Promise<CustomerCountBreakResponse> {
  const scenario = scenarioId ? `&scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/threshold/customer-count?emirate=${encodeURIComponent(emirate)}${scenario}`);
}

export function getBottleneck(scenarioId?: string | null): Promise<BottleneckResponse> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/bottleneck${query}`);
}

export function getBrief(scenarioId?: string | null): Promise<DecisionBrief> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/brief${query}`);
}

export function listSavedScenarios(): Promise<SavedScenarioInfo[]> {
  return request("/scenarios/saved");
}

export function listScenarios(): Promise<ScenarioModuleInfo[]> {
  return request("/scenarios");
}

export function simulate(body: SimulateRequest): Promise<SimulateResponse> {
  return request("/simulate", { method: "POST", body: JSON.stringify(body) });
}

export function optimize(body: OptimizeRequest): Promise<OptimizeResponse> {
  return request("/optimize", { method: "POST", body: JSON.stringify(body) });
}

export function queryAgent(body: AgentQueryRequest): Promise<AgentQueryResponse> {
  return request("/agent/query", { method: "POST", body: JSON.stringify(body) });
}

export function listAgents(): Promise<AgentSpec[]> {
  return request("/agents");
}

export function createAgent(spec: AgentSpec): Promise<AgentSpec> {
  return request("/agents", { method: "POST", body: JSON.stringify(spec) });
}

export function deleteAgent(name: string): Promise<void> {
  return request(`/agents/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function ingest(
  file: File,
  options?: { columnOverrides?: Record<string, Record<string, string>>; aggregateZonesToH3?: boolean }
): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.columnOverrides) {
    formData.append("column_overrides", JSON.stringify(options.columnOverrides));
  }
  if (options?.aggregateZonesToH3) {
    formData.append("aggregate_zones_to_h3", "true");
  }
  return request("/ingest", { method: "POST", body: formData });
}

export function deleteSavedScenario(scenarioId: string): Promise<void> {
  return request(`/scenarios/saved/${encodeURIComponent(scenarioId)}`, { method: "DELETE" });
}

export function getAlerts(): Promise<AlertInfo[]> {
  return request("/alerts");
}

export function acknowledgeAlert(alertId: number): Promise<void> {
  return request(`/alerts/${alertId}/acknowledge`, { method: "PATCH" });
}

/** Official event-dataset performance figures, served verbatim. */
export interface EventHubMetrics {
  courier_utilisation_pct: number;
  vehicle_utilisation_pct: number;
  on_time_delivery_pct: number;
  first_attempt_success_pct: number;
  capacity_headroom_pct: number;
  sla_breach_count: number;
  avg_delivery_time_min: number;
  status: "At Risk" | "High Load" | "Normal";
}

export interface EventMetricsResponse {
  week: number;
  hub_count: number;
  hubs: Record<string, EventHubMetrics>;
  at_risk: string[];
  at_risk_count: number;
  baselines: { metric: string; current: string; target: string; notes: string }[];
  weekly_demand: { week: number; total_volume: number }[];
}

export function getEventMetrics(): Promise<EventMetricsResponse> {
  return request("/event/metrics");
}

/** Absolute URL for a backend file-download endpoint (reports/exports).
 *  Downloads navigate the browser straight to the API — the backend sets
 *  Content-Disposition: attachment; nothing is computed client-side. */
export function exportUrl(path: string): string {
  return `${API_URL}${path}`;
}
