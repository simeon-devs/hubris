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

export type GapDirection = "understaffed" | "balanced" | "overstaffed";

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
  // Workforce — computed by the engine's WorkforceRequirementMetric, never in
  // the browser (the honesty rule in lib/api.ts). Optional so the UI still
  // renders against a backend that predates the metric.
  required_headcount?: number;
  sustainable_headcount?: number;
  headcount_gap?: number;
  gap_direction?: GapDirection;
  required_permanent?: number;
  required_outsourced?: number;
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

// One vehicle type's engine-computed cost for a hub→zone corridor
// (backend/hubris/engine/route_cost.py) — every component shown, no
// arithmetic left to the browser.
export interface RouteCostMode {
  fleet_id: string;
  fleet_name: string;
  vehicle_capacity: number;
  cost_per_km: number;
  variable_cost: number;
  vehicle_fixed_cost: number;
  trip_cost: number;
  cost_per_parcel: number;
}

export interface RouteCostResponse {
  from_hub: string;
  to_zone: string;
  distance_km: number;
  time_min: number;
  od_cost_per_parcel: number;
  handling_cost_per_parcel: number;
  modes: RouteCostMode[]; // sorted cheapest-per-parcel first
}

export interface RefreshDistancesResponse {
  distance_mode: DistanceMode;
  od_pairs_updated: number;
  cost_to_serve_before: number;
  cost_to_serve_after: number;
}

export interface SavedScenarioInfo {
  id: string;
  label: string;
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
  demand_variation_pct?: number;
  scenario_id?: string | null;
}

export interface RobustnessBand {
  demand_variation_pct: number;
  trials: number;
  cost_to_serve_p10: number;
  cost_to_serve_p50: number;
  cost_to_serve_p90: number;
  feasible_pct: number;
  holds_under_variation: boolean;
}

export interface OptimizeResponse {
  changes: { action: string; hub_id: string }[];
  objective_value: number;
  delta_vs_baseline: Record<string, number>;
  rationale: Record<string, unknown>;
  cost_to_serve_before: number;
  cost_to_serve_after: number;
  cost_to_serve_savings_per_parcel: number;
  robustness: RobustnessBand;
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

// Provenance guardrail verdict — computed by the backend's runtime check
// (agents/provenance.py via agents/runner.py), never inferred client-side.
export interface VerificationInfo {
  grounded: boolean;
  unexplained_numbers: number[];
  retried: boolean;
}

export interface AgentQueryResponse {
  answer: string;
  tool_calls: ToolCallTrace[];
  role: string | null;
  agent_name: string | null;
  verification?: VerificationInfo | null;
}

// A monitoring agent's finding (GET /alerts) — produced automatically after
// ingest / scenario saves by agents with autonomy="monitoring".
export interface AlertInfo {
  id: number;
  agent_name: string;
  trigger: string;
  answer: string;
  verification: VerificationInfo | null;
  tool_calls: number;
  status: "ok" | "error";
  ts: number;
  acknowledged: boolean;
}

export interface AgentSpec {
  name: string;
  goal: string;
  allowed_tools: string[];
  autonomy: string;
}

export interface OverlappingCoverageFinding {
  type: "overlapping_coverage";
  hub_a_id: string;
  hub_b_id: string;
  overlap_zone_count: number;
  overlap_zone_ids: string[];
  overlap_demand: number;
  distance_km: number;
  why: string;
}

export interface FarHubServiceFinding {
  type: "far_hub_service";
  zone_id: string;
  actual_hub_id: string;
  cheapest_hub_id: string;
  excess_cost_per_unit: number;
  excess_cost_total: number;
  why: string;
}

export interface IdleNextToOverloadFinding {
  type: "idle_next_to_overload";
  overloaded_hub_id: string;
  overloaded_utilization_pct: number;
  idle_hub_id: string;
  idle_utilization_pct: number;
  idle_spare_capacity: number;
  network_avg_utilization_pct: number;
  distance_km: number;
  why: string;
}

export interface DemandGrowthBreakResponse {
  hub_id: string;
  threshold_found: boolean;
  already_broken_at_current_demand?: boolean;
  growth_factor_threshold?: number;
  growth_pct_threshold?: number;
  hub_utilization_pct?: number;
  hub_dual?: number;
  unmet_demand?: Record<string, number>;
  reason?: string;
  searched_up_to_growth_factor?: number;
}

export interface CustomerCountBreakResponse {
  emirate: string;
  threshold_found: boolean;
  already_broken_at_current_demand?: boolean;
  customer_count_threshold?: number;
  served_pct_at_threshold?: number;
  unmet_demand_at_threshold?: Record<string, number>;
  representative_customer_profile?: { demand: number; sla_hours: number };
  reason?: string;
  searched_up_to_customer_count?: number;
}

export interface BottleneckUnlockRecommendation {
  hub_id: string;
  unlock_units: number;
  new_capacity: number;
  verified_cost_savings: number;
  unlocked_zone_ids: string[];
}

export interface BottleneckResponse {
  bottleneck_found: boolean;
  recommendation?: BottleneckUnlockRecommendation;
  all_candidates?: BottleneckUnlockRecommendation[];
  why?: string;
  reason?: string;
}

export interface DecisionBrief {
  generated_at: string;
  summary: string;
  current_state: {
    cost_to_serve: number;
    utilization_pct: number;
    coverage_pct: number;
    spare_capacity: number;
    network_summary: NetworkSummary;
  };
  proposed_change: {
    changes: { action: string; hub_id: string }[];
    objective_value: number;
    rationale: Record<string, unknown>;
  };
  cost_risk: {
    cost_to_serve_before: number;
    cost_to_serve_after: number;
    cost_to_serve_savings_per_parcel: number;
    delta_vs_baseline: Record<string, number>;
  };
  sensitivity: RobustnessBand;
  what_it_unblocks: BottleneckResponse | null;
}

export interface OpportunitiesResponse {
  overlapping_coverage: OverlappingCoverageFinding[];
  far_hub_service: FarHubServiceFinding[];
  idle_next_to_overload: IdleNextToOverloadFinding[];
  total_opportunities: number;
  inefficiency_types_found: number;
}

export interface IngestResponse {
  hubs: number;
  zones: number;
  fleet_types: number;
  od_matrix: number;
  current_assignments: number;
}
