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
  // Two DISTINCT coverage-family quantities, never conflated: coverage is
  // SLA reachability (capacity-blind); demand_served is what the
  // capacity-constrained flow actually serves, with unmet_by_zone named.
  coverage: MetricResult;
  demand_served: MetricResult;
  spare_capacity: MetricResult;
  demand_by_emirate: MetricResult;
  network_summary: NetworkSummary;
}

export type GapDirection = "understaffed" | "balanced" | "overstaffed";

// POST /optimize/frontier — the realism frontier. Both cost pools per point,
// labelled: variable-only is the pool the dataset's ≤7.00 target is defined
// on; fully-loaded is what consolidation attacks. They move in OPPOSITE
// directions — the UI must always show them side by side, named.
export interface CostPools {
  variable_only_aed_per_parcel: number;
  fully_loaded_aed_per_parcel: number;
  variable_target_aed: number;
  variable_vs_target_aed: number;
  meets_variable_target: boolean;
}

export interface FrontierSide {
  objective_value: number;
  delta_vs_baseline_pct: number | null;
  cost_to_serve_after: number;
  cost_pools: CostPools;
  changes: { action: string; hub_id: string }[];
  hubs_open: string[];
  hubs_open_count: number;
  volume_share_by_hub: Record<string, number>;
  constraints_enforced: boolean;
  solver: string;
}

export interface FrontierResponse {
  baseline: {
    cost_to_serve: number;
    total_cost: number;
    cost_pools: CostPools;
    hubs_open_count: number;
  };
  unconstrained: FrontierSide;
  constrained: FrontierSide;
  resilience_premium: {
    total_cost_delta: number;
    pct_points_of_saving_given_up: number | null;
  };
  params: {
    min_hubs_per_emirate: number;
    max_hub_volume_share: number;
  };
  recommendation_policy: string;
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
// (T-33 ProvenanceVerifier contract), never inferred client-side.
// "verified": every figure traced to a tool result on the first pass.
// "regenerated": the check caught untraceable figures and forced a
//   correction that then verified — the guardrail working, not a failure.
// "flagged": still untraceable after regeneration; untraceable_figures
//   names the exact numbers and MUST be shown (hard rule: never render
//   flagged prose as trustworthy).
export interface VerificationInfo {
  status: "verified" | "regenerated" | "flagged";
  untraceable_figures: number[];
  attempts: number;
  checked_against: string[];
}

export interface AgentQueryResponse {
  answer: string;
  tool_calls: ToolCallTrace[];
  role: string | null;
  agent_name: string | null;
  verification?: VerificationInfo | null;
}

// The capacity watchdog's computed finding (GET /memory/alerts, T-40).
// Deterministic engine output — no LLM in the background loop by design:
// each sweep runs a REAL stress simulation, and every figure below is a
// solver result with `provenance` naming the sweep that produced it.
export interface AlertFinding {
  target: string; // "baseline+1.2x" or a saved scenario id (e.g. qcomm_twin)
  stress_factor: number | null;
  feasible: boolean;
  unmet_demand: Record<string, number>; // zone_id -> unserved parcels/day
  hottest_hub: string | null;
  hottest_utilization_pct: number;
  hot_threshold_pct: number;
}

export interface AlertAction {
  action: string; // "add_capacity" | "review_robustness"
  detail: { [key: string]: unknown } | string;
  why?: string;
  source_tool: string;
}

export interface AlertInfo {
  id: string; // uuid
  agent_name: string;
  severity: "critical" | "warning";
  finding: AlertFinding;
  recommended_action: AlertAction;
  brief_link: string;
  acknowledged: boolean;
  provenance: string;
  created_at: string; // ISO timestamp
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
