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
    """Provenance guardrail verdict (agents/provenance.py, run live in
    agents/runner.py): did every number in the answer trace back to an
    actual tool result? `retried` records that the agent was made to
    correct itself once before this verdict."""

    grounded: bool
    unexplained_numbers: list[float] = []
    retried: bool = False


class AgentQueryResponse(BaseModel):
    answer: str
    tool_calls: list[ToolCallTrace]
    role: str | None = None
    agent_name: str | None = None
    verification: VerificationInfo | None = None


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
    utilization_pct: float
    spare_capacity: float
    cost_to_serve: float
    # Workforce (WorkforceRequirementMetric). Defaults keep older clients and
    # any caller that builds a HubMapInfo by hand working unchanged.
    required_headcount: int = 0
    sustainable_headcount: int = 0
    headcount_gap: int = 0
    gap_direction: str = "balanced"  # understaffed | balanced | overstaffed
    required_permanent: int = 0
    required_outsourced: int = 0


class ZoneMapInfo(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    emirate: str
    demand: float


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
    from_hub: str
    to_zone: str
    distance_km: float
    time_min: float
    od_cost_per_parcel: float
    handling_cost_per_parcel: float
    modes: list[RouteCostMode]  # sorted cheapest-per-parcel first
