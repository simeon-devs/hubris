"""T-32: the assumption registry — every numeric engine input parameter,
in ONE place, each tagged with an evidence status. Extends the
no-fabrication guarantee from agent OUTPUTS (T-33) to engine INPUTS: a
planner (or judge) can always ask "what does this number rest on?" and get
a labelled answer instead of a constant buried in a module.

Statuses (BUILD_SPEC §11 / member-1 assessment pattern):
  verified — stated in the dataset/brief/spec, with the source cited
  derived  — computed or empirically chosen from verified/observed runs,
             via a stated method
  assumed  — a configurable placeholder; no authoritative source exists.
             MUST be revisited when the real dataset lands (T-28).

Modules do not define these constants themselves — they import them from
here (`value("...")`), so the registry can never drift from the code.
Exposed at GET /assumptions.
"""

from typing import Literal

from pydantic import BaseModel

Status = Literal["verified", "derived", "assumed"]


class Assumption(BaseModel):
    name: str
    value: float | int | str
    status: Status
    source: str  # where it comes from / why this value
    used_by: list[str]  # module paths that consume it


_REGISTRY: dict[str, Assumption] = {}


def _register(name: str, value: float | int | str, status: Status, source: str, used_by: list[str]) -> None:
    if name in _REGISTRY:
        raise ValueError(f"duplicate assumption: {name}")
    _REGISTRY[name] = Assumption(name=name, value=value, status=status, source=source, used_by=used_by)


def value(name: str) -> float | int | str:
    return _REGISTRY[name].value


def all_assumptions() -> list[Assumption]:
    return list(_REGISTRY.values())


# ---- geometry / distances --------------------------------------------------
_register(
    "road_factor", 1.3, "assumed",
    "SCHEMA.md §2 fallback convention: road distance ≈ haversine × ~1.3. No EMX routing "
    "data corroborates the factor; superseded entirely when OSRM mode is active (T-19).",
    ["hubris/engine/geo.py"],
)
_register(
    "avg_speed_kmh", 40.0, "assumed",
    "Urban UAE average drive speed placeholder for deriving time_min from distance where "
    "no travel-time data exists. No EMX figure available.",
    [
        "hubris/engine/routing.py",
        "hubris/ingestion/excel_connector.py",
        "hubris/data/synthetic.py",
        "hubris/plugins/scenarios/add_hub.py",
        "hubris/plugins/scenarios/add_customer.py",
        "hubris/plugins/scenarios/move_hub.py",
    ],
)
_register(
    "osrm_timeout_seconds", 8.0, "assumed",
    "Public-OSRM latency budget; overridable via OSRM_TIMEOUT_SECONDS env var. Beyond it "
    "the whole-batch haversine fallback engages (T-19).",
    ["hubris/engine/routing.py"],
)
_register(
    "fallback_cost_per_km", 1.6, "assumed",
    "Used only when a dataset carries no fleet_types at all (SCHEMA.md §2 'no cost model "
    "given'). With fleet data present, the Van's real cost_per_km is used instead.",
    ["hubris/engine/cost_model.py"],
)

# ---- flow / optimisation ---------------------------------------------------
_register(
    "overflow_penalty", 1_000_000.0, "derived",
    "Set ≥3 orders of magnitude above any real edge cost (domain edges are tens-to-hundreds "
    "AED) so unmet demand is never preferred over any real route; verified by "
    "test_flow.py's 500k-edge test.",
    ["hubris/engine/flow.py"],
)
_register(
    "milp_time_limit_seconds", 20.0, "assumed",
    "CBC solve budget before the greedy fallback engages (CLAUDE.md §7: the demo never "
    "hangs). 12-hub instances solve in <1s; the margin is safety, not measurement.",
    ["hubris/plugins/optimizers/milp.py"],
)

# ---- opportunity scanner (T-21) --------------------------------------------
_register(
    "scanner_min_overlap_zones", 3, "assumed",
    "Below 3 shared zones, two hubs sharing edge zones is normal geography, not redundancy.",
    ["hubris/engine/opportunities.py"],
)
_register(
    "scanner_primary_cost_ratio", 1.15, "assumed",
    "A hub counts as a zone's 'primary' option within 15% of the cheapest cost — chosen "
    "empirically on the T-04 dataset (raw SLA reachability was near-universal and useless).",
    ["hubris/engine/opportunities.py"],
)
_register(
    "scanner_min_excess_cost_per_unit", 1.0, "assumed",
    "AED/parcel materiality floor for far-hub findings; filters solver rounding noise "
    "(observed real near-miss: 0.68 AED/unit on the synthetic seed).",
    ["hubris/engine/opportunities.py"],
)
_register(
    "scanner_high_utilization_ratio", 1.5, "assumed",
    "'Hot' = ≥1.5× the network's own average utilisation (relative, so a lightly-loaded "
    "network still surfaces imbalance).",
    ["hubris/engine/opportunities.py"],
)
_register(
    "scanner_low_utilization_ratio", 0.75, "assumed",
    "'Idle' = ≤0.75× the network average.",
    ["hubris/engine/opportunities.py"],
)
_register(
    "scanner_min_overloaded_utilization_pct", 10.0, "assumed",
    "Absolute floor so near-zero-everywhere networks don't flag noise as overload.",
    ["hubris/engine/opportunities.py"],
)
_register(
    "scanner_nearby_km", 120.0, "assumed",
    "Rebalancing radius: UAE is compact enough that this spans within-emirate pairs.",
    ["hubris/engine/opportunities.py"],
)

# ---- Monte Carlo (T-20) ----------------------------------------------------
_register(
    "mc_demand_variation_pct", 20.0, "verified",
    "BUILD_SPEC §7 names the ±20% robustness band explicitly ('holds under demand ±20%').",
    ["hubris/engine/monte_carlo.py"],
)
_register(
    "mc_trials", 50, "assumed",
    "Trial count balancing band stability against UI-facing latency (~50 LP re-solves).",
    ["hubris/engine/monte_carlo.py"],
)
_register(
    "mc_seed", 42, "derived",
    "Fixed seed per CLAUDE.md §7 determinism: same inputs → same band. The specific value "
    "is arbitrary; its FIXEDNESS is the requirement.",
    ["hubris/engine/monte_carlo.py"],
)

# ---- threshold finder (T-22) -----------------------------------------------
_register(
    "threshold_tolerance", 0.01, "assumed",
    "Binary-search convergence width on the demand-growth factor.",
    ["hubris/agents/threshold_finder.py"],
)
_register(
    "threshold_max_growth_factor", 20.0, "assumed",
    "Search ceiling: past 20× demand growth, 'when does it break' stops being a planning "
    "question.",
    ["hubris/agents/threshold_finder.py"],
)
_register(
    "threshold_max_customer_count", 200, "assumed",
    "Search ceiling for added synthetic customers per emirate.",
    ["hubris/agents/threshold_finder.py"],
)
_register(
    "default_sla_hours", 24.0, "assumed",
    "SLA applied when a data row provides none; also the synthetic customers' profile "
    "fallback.",
    ["hubris/agents/threshold_finder.py", "hubris/engine/h3_zoning.py"],
)

# ---- H3 / demo -------------------------------------------------------------
_register(
    "h3_default_resolution", 7, "assumed",
    "~1.2km hex edge — sized for last-mile zone granularity; tune per dataset density.",
    ["hubris/engine/h3_zoning.py"],
)
_register(
    "demo_demand_factor", 5.0, "derived",
    "Chosen empirically (T-30): the smallest surge at which every signature feature has "
    "something real to say while min-cost flow still fully serves demand.",
    ["hubris/data/demo_scenario.py"],
)
# ---- monitoring (T-40) -----------------------------------------------------
_register(
    "monitoring_interval_seconds", 300, "assumed",
    "Watchdog sweep cadence. Long enough to be invisible in cost, short enough that a "
    "planner sees the twin acting on its own during a session.",
    ["hubris/monitoring/scheduler.py"],
)
_register(
    "watchdog_stress_factor", 1.2, "assumed",
    "The REAL stress simulation the watchdog runs against the baseline each sweep "
    "(demand_scale x this) — a plausible near-term surge, not a black-swan.",
    ["hubris/monitoring/watchdog.py"],
)
_register(
    "watchdog_hot_utilization_pct", 90.0, "assumed",
    "Alert threshold: a hub at/above this flow-based utilisation under the sweep's "
    "conditions is a capacity risk worth pushing to the planner unprompted.",
    ["hubris/monitoring/watchdog.py"],
)

_register(
    "demo_target_emirate", "Sharjah", "derived",
    "The emirate whose hub (H5) binds first under growth (T-22's break-even search) — the "
    "most instructive stress locus. Falls back to network-wide if absent from the dataset.",
    ["hubris/data/demo_scenario.py"],
)
