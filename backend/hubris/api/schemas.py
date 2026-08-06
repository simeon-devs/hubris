"""Pydantic request/response models for the FastAPI routers (T-15)."""

from typing import Any

from pydantic import BaseModel


class SimulateRequest(BaseModel):
    scenario_name: str
    params: dict[str, Any]
    base_scenario_id: str | None = None
    save_as: str | None = None


class SimulateResponse(BaseModel):
    scenario_name: str
    applied_heuristics: list[dict[str, Any]] = []  # T-39
    params: dict[str, Any]
    baseline_kpis: dict[str, Any]
    scenario_kpis: dict[str, Any]
    delta: dict[str, float]
    delta_pct: dict[str, float]
    scenario_flow_feasible: bool
    scenario_id: str | None = None


class OptimizeRequest(BaseModel):
    objective: dict[str, Any] = {}
    constraints: list[dict[str, Any]] = []
    optimizer_name: str = "milp_cflp"
    demand_variation_pct: float = 20.0
    scenario_id: str | None = None


class RobustnessBandInfo(BaseModel):
    demand_variation_pct: float
    trials: int
    cost_to_serve_p10: float
    cost_to_serve_p50: float
    cost_to_serve_p90: float
    feasible_pct: float
    holds_under_variation: bool


class OptimizeResponse(BaseModel):
    changes: list[dict[str, Any]]
    # T-39: stored heuristics that matched this run — the twin visibly
    # using what it learned (annotation-only; never changes computation).
    applied_heuristics: list[dict[str, Any]] = []
    objective_value: float
    delta_vs_baseline: dict[str, float]
    rationale: dict[str, Any]
    cost_to_serve_before: float
    cost_to_serve_after: float
    cost_to_serve_savings_per_parcel: float
    robustness: RobustnessBandInfo


class AgentQueryRequest(BaseModel):
    question: str
    mode: str = "workforce"  # "workforce" | "single" — ignored if agent_name is set
    agent_name: str | None = None
    scenario_id: str | None = None


class ToolCallTrace(BaseModel):
    tool: str
    args: dict[str, Any]
    result: Any = None


class VerificationInfo(BaseModel):
    """T-33: the provenance verdict attached to every agent answer.
    status: "verified" (clean first pass) | "regenerated" (clean after one
    regeneration) | "flagged" (still contains figures traceable to no tool
    result — listed in untraceable_figures so the UI can name them)."""

    status: str
    untraceable_figures: list[float] = []
    attempts: int = 1
    checked_against: list[str] = []


class AgentQueryResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCallTrace]
    # Required, deliberately: a response without a verdict must fail loudly
    # at the schema layer, not slip through as unverified prose (T-33).
    verification: VerificationInfo
    role: str | None = None
    agent_name: str | None = None


class CreateAgentRequest(BaseModel):
    name: str
    goal: str
    allowed_tools: list[str]
    autonomy: str = "on-demand"


class AgentSpecResponse(BaseModel):
    name: str
    goal: str
    allowed_tools: list[str]
    autonomy: str


class GoalTargets(BaseModel):
    """Structured, LLM-free objective for /goal (rule 4: the demo path
    never depends on the LLM being up)."""

    target_cost_reduction_pct: float
    max_utilization: float | None = None


class GoalRequest(BaseModel):
    objective: str | None = None  # plain English; parsed by the LLM
    targets: GoalTargets | None = None  # structured; skips the LLM entirely
    max_iterations: int = 5
    scenario_id: str | None = None


class GoalResponse(BaseModel):
    success: bool
    objective_text: str
    target_pct_reduction: float
    max_utilization_cap: float | None
    achieved_pct_reduction: float | None
    recommendation: dict[str, Any] | None
    path: list[dict[str, Any]]  # one entry per iteration — render this, not just the endpoint


class ScenarioModuleInfo(BaseModel):
    name: str
    params_schema: dict[str, Any]


class SavedScenarioInfo(BaseModel):
    id: str
    label: str


class IngestResponse(BaseModel):
    hubs: int
    zones: int
    fleet_types: int
    od_matrix: int
    current_assignments: int


class HubMapInfo(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    emirate: str
    capacity: float
    status: str
    # T-37 — two deliberately distinct quantities, named apart:
    # utilization_pct: flow-based (actual volumes; never >100 while feasible)
    # assignment_share_pct: dominant-hub attribution (T-02 collapse; a split
    #   zone's whole demand lands on one hub, so this CAN exceed 100 — it is
    #   an attribution view, not physical utilisation)
    utilization_pct: float
    assignment_share_pct: float
    # R1: facility capability (dataset G) — None on datasets without types
    hub_type: str | None = None
    service_models: list[str] | None = None
    # R2: the real rider roster (dataset G) — None when the dataset has none
    riders_fte: int | None = None
    riders_ftc: int | None = None
    rider_capacity_daily: float | None = None
    rider_weekly_cost: float | None = None
    # Workforce (WorkforceRequirementMetric, assigned-demand basis). Defaults
    # keep any caller that builds a HubMapInfo by hand working unchanged.
    required_headcount: int = 0
    sustainable_headcount: int = 0
    headcount_gap: int = 0
    gap_direction: str = "balanced"  # understaffed | balanced | overstaffed
    required_permanent: int = 0
    required_outsourced: int = 0
    # Fleet aggregates (Fleet_Roster rows x counts, computed engine-side) —
    # None when the dataset carries no fleet for this facility.
    fleet_vehicles: int | None = None
    fleet_daily_cost: float | None = None
    fleet_capacity_units: float | None = None
    spare_capacity: float
    cost_to_serve: float


class ZoneMapInfo(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    emirate: str
    demand: float
    service_model: str | None = None  # R1: Standard | Express | QComm | None


class FlowMapInfo(BaseModel):
    hub_id: str
    zone_id: str
    volume: float


class FleetTypeInfo(BaseModel):
    id: str
    name: str
    capacity: float
    cost_per_km: float
    fixed_cost: float
    count_available: int
    hub_id: str | None = None


class NetworkMapResponse(BaseModel):
    hubs: list[HubMapInfo]
    zones: list[ZoneMapInfo]
    flows: list[FlowMapInfo]
    fleet_types: list[FleetTypeInfo]
    distance_mode: str  # "osrm" (real drive distances) | "haversine_fallback"
    # T-31: "provided" | "reconstructed_nearest_hub" — the baseline every
    # improvement is measured against, labelled, never implied to be real.
    baseline_provenance: str


class RefreshDistancesResponse(BaseModel):
    distance_mode: str  # "osrm" | "haversine_fallback" — whichever this call actually used
    od_pairs_updated: int
    cost_to_serve_before: float
    cost_to_serve_after: float


class RouteCostMode(BaseModel):
    fleet_id: str
    fleet_name: str
    vehicle_capacity: float
    cost_per_km: float
    variable_cost: float
    vehicle_fixed_cost: float
    trip_cost: float
    cost_per_parcel: float


class RouteCostResponse(BaseModel):
    """Per-fleet corridor cost (engine/route_cost.py). `modes` sorted
    cheapest-first; `od_cost_per_parcel` is the canonical calibrated figure
    the optimiser prices — the per-mode numbers are a comparison view."""

    from_hub: str
    to_zone: str
    distance_km: float
    time_min: float
    od_cost_per_parcel: float
    handling_cost_per_parcel: float
    modes: list[RouteCostMode]
