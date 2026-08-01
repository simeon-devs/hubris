// Mirrors backend/hubris/api/schemas.py — the frontend never invents a
// shape the API doesn't actually return.

export interface MetricResult {
  name: string;
  value: number | Record<string, number>;
  unit: string;
  breakdown: Record<string, number | Record<string, number>> | null;
}

export interface NetworkSummary {
  hub_count: number;
  open_hub_count: number;
  zone_count: number;
  emirate_count: number;
  total_demand: number;
}

export interface KpisResponse {
  cost_to_serve: MetricResult;
  utilization: MetricResult;
  coverage: MetricResult;
  spare_capacity: MetricResult;
  network_summary: NetworkSummary;
}

export interface HubMapInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  emirate: string;
  capacity: number;
  status: string;
  utilization_pct: number;
  spare_capacity: number;
  cost_to_serve: number;
}

export interface ZoneMapInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  emirate: string;
  demand: number;
}

export interface FlowMapInfo {
  hub_id: string;
  zone_id: string;
  volume: number;
}

export interface FleetTypeInfo {
  id: string;
  name: string;
  capacity: number;
  cost_per_km: number;
  fixed_cost: number;
  count_available: number;
  hub_id: string | null;
}

export type DistanceMode = "osrm" | "haversine_fallback";

export interface NetworkMapResponse {
  hubs: HubMapInfo[];
  zones: ZoneMapInfo[];
  flows: FlowMapInfo[];
  fleet_types: FleetTypeInfo[];
  distance_mode: DistanceMode;
}

export interface RefreshDistancesResponse {
  distance_mode: DistanceMode;
  od_pairs_updated: number;
  cost_to_serve_before: number;
  cost_to_serve_after: number;
}

export interface ScenarioModuleInfo {
  name: string;
  params_schema: {
    type: string;
    properties?: Record<string, { type: string | string[]; description?: string }>;
    required?: string[];
  };
}

export interface SimulateRequest {
  scenario_name: string;
  params: Record<string, unknown>;
  base_scenario_id?: string | null;
  save_as?: string | null;
}

export interface SimulateResponse {
  scenario_name: string;
  params: Record<string, unknown>;
  baseline_kpis: KpisResponse;
  scenario_kpis: KpisResponse;
  delta: Record<string, number>;
  delta_pct: Record<string, number>;
  scenario_flow_feasible: boolean;
  scenario_id: string | null;
}

export interface OptimizeRequest {
  objective?: Record<string, unknown>;
  constraints?: Record<string, unknown>[];
  optimizer_name?: string;
  scenario_id?: string | null;
}

export interface OptimizeResponse {
  changes: { action: string; hub_id: string }[];
  objective_value: number;
  delta_vs_baseline: Record<string, number>;
  rationale: Record<string, unknown>;
  cost_to_serve_before: number;
  cost_to_serve_after: number;
  cost_to_serve_savings_per_parcel: number;
}

export interface ToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AgentQueryRequest {
  question: string;
  mode?: "workforce" | "single";
  agent_name?: string | null;
  scenario_id?: string | null;
}

export interface AgentQueryResponse {
  answer: string;
  tool_calls: ToolCallTrace[];
  role: string | null;
  agent_name: string | null;
}

export interface AgentSpec {
  name: string;
  goal: string;
  allowed_tools: string[];
  autonomy: string;
}

export interface IngestResponse {
  hubs: number;
  zones: number;
  fleet_types: number;
  od_matrix: number;
  current_assignments: number;
}
