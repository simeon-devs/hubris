// Thin fetch wrapper over the FastAPI backend (T-15). Every function here
// returns exactly what the API returned — no client-side computation of
// any figure the UI displays (the honesty rule: numbers come from the
// engine, never from the browser).

import type {
  AgentQueryRequest,
  AgentQueryResponse,
  AgentSpec,
  BottleneckResponse,
  CustomerCountBreakResponse,
  DemandGrowthBreakResponse,
  IngestResponse,
  KpisResponse,
  NetworkMapResponse,
  OpportunitiesResponse,
  OptimizeRequest,
  OptimizeResponse,
  RefreshDistancesResponse,
  ScenarioModuleInfo,
  SimulateRequest,
  SimulateResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: init?.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
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

export function getOpportunities(scenarioId?: string | null): Promise<OpportunitiesResponse> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/opportunities${query}`);
}

export function getDemandGrowthBreak(hubId: string): Promise<DemandGrowthBreakResponse> {
  return request(`/threshold/demand-growth?hub_id=${encodeURIComponent(hubId)}`);
}

export function getCustomerCountBreak(emirate: string): Promise<CustomerCountBreakResponse> {
  return request(`/threshold/customer-count?emirate=${encodeURIComponent(emirate)}`);
}

export function getBottleneck(scenarioId?: string | null): Promise<BottleneckResponse> {
  const query = scenarioId ? `?scenario_id=${encodeURIComponent(scenarioId)}` : "";
  return request(`/bottleneck${query}`);
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

export function ingest(file: File): Promise<IngestResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return request("/ingest", { method: "POST", body: formData });
}
