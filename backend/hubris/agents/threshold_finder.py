"""Threshold / break-even finder (T-22; BUILD_SPEC §5): a goal-loop
variant — instead of searching for changes that hit a cost target
(`goal_loop.py`), this searches for the PARAMETER VALUE at which the
network first breaks. Two named questions, two search functions, both
binary-search over the real engine (re-solving the flow LP each trial —
never estimated or extrapolated):

- `find_demand_growth_break`: "at what demand growth does Hub X break?" —
  scales ONLY the zones currently assigned to hub_id and finds the growth
  factor at which hub_id's own capacity constraint first binds (its T-08
  dual becomes nonzero) in a freshly re-solved flow.
- `find_customer_count_break`: "how many customers before SLA fails?" —
  adds synthetic customers (a deterministic golden-angle spiral around the
  emirate's own zone centroid — no RNG, no hardcoded coordinates, so this
  works on any ingested dataset, not just the UAE synthetic fixture; demand
  and sla_hours are the emirate's own average/most-common values, never
  invented) one at a time until the network can no longer place every
  zone's demand within its SLA window.
"""

import math
from collections import Counter

from hubris.core import assumptions
from hubris.core.contracts import NetworkModel
from hubris.engine.flow import solve_min_cost_flow
from hubris.plugins.scenarios.add_customer import AddCustomerScenario

DUAL_EPSILON = 1e-6  # numerical zero for LP duals; not a planning assumption
# T-32: values + evidence labels live in core/assumptions.py
DEFAULT_TOLERANCE = assumptions.value("threshold_tolerance")
DEFAULT_MAX_GROWTH_FACTOR = assumptions.value("threshold_max_growth_factor")
DEFAULT_MAX_CUSTOMER_COUNT = assumptions.value("threshold_max_customer_count")
DEFAULT_SLA_HOURS = assumptions.value("default_sla_hours")


def _scale_hub_zone_demand(model: NetworkModel, hub_id: str, factor: float) -> NetworkModel:
    assigned_zone_ids = {
        zone_id for zone_id, assigned_hub_id in (model.assignments or {}).items() if assigned_hub_id == hub_id
    }
    copy = model.model_copy(deep=True)
    for zone in copy.zones:
        if zone.id in assigned_zone_ids:
            zone.demand = round(zone.demand * factor, 4)
            copy.demand[zone.id] = zone.demand
    return copy


def _hub_breaks_at_factor(model: NetworkModel, hub_id: str, factor: float) -> tuple[bool, dict]:
    scaled = _scale_hub_zone_demand(model, hub_id, factor)
    flow = solve_min_cost_flow(scaled)
    breaks = abs(flow.hub_duals.get(hub_id, 0.0)) > DUAL_EPSILON or bool(flow.unmet_demand)

    hub = next((h for h in scaled.hubs if h.id == hub_id), None)
    hub_flow_volume = sum(flow.flows.get(hub_id, {}).values())
    evidence = {
        "hub_utilization_pct": round(hub_flow_volume / hub.capacity * 100, 2) if hub and hub.capacity else 0.0,
        "hub_dual": flow.hub_duals.get(hub_id, 0.0),
        "unmet_demand": flow.unmet_demand,
    }
    return breaks, evidence


def find_demand_growth_break(
    model: NetworkModel,
    hub_id: str,
    tolerance: float = DEFAULT_TOLERANCE,
    max_growth_factor: float = DEFAULT_MAX_GROWTH_FACTOR,
) -> dict:
    if not any(hub.id == hub_id for hub in model.hubs):
        raise ValueError(f"Unknown hub_id: {hub_id!r}")

    assigned_zone_ids = {
        zone_id for zone_id, assigned_hub_id in (model.assignments or {}).items() if assigned_hub_id == hub_id
    }
    if not assigned_zone_ids:
        return {
            "hub_id": hub_id,
            "threshold_found": False,
            "reason": f"{hub_id} currently has no assigned demand to grow.",
        }

    already_breaks, evidence = _hub_breaks_at_factor(model, hub_id, 1.0)
    if already_breaks:
        return {
            "hub_id": hub_id,
            "threshold_found": True,
            "already_broken_at_current_demand": True,
            "growth_factor_threshold": 1.0,
            "growth_pct_threshold": 0.0,
            **evidence,
        }

    lower, upper = 1.0, 2.0
    iterations = 0
    while True:
        breaks, evidence = _hub_breaks_at_factor(model, hub_id, upper)
        if breaks:
            break
        if upper >= max_growth_factor:
            return {
                "hub_id": hub_id,
                "threshold_found": False,
                "reason": (
                    f"{hub_id} does not break within a {max_growth_factor}x demand-growth search range."
                ),
                "searched_up_to_growth_factor": upper,
            }
        lower, upper = upper, upper * 2
        iterations += 1

    while upper - lower > tolerance and iterations < 100:
        mid = (lower + upper) / 2
        breaks, mid_evidence = _hub_breaks_at_factor(model, hub_id, mid)
        if breaks:
            upper, evidence = mid, mid_evidence
        else:
            lower = mid
        iterations += 1

    return {
        "hub_id": hub_id,
        "threshold_found": True,
        "already_broken_at_current_demand": False,
        "growth_factor_threshold": round(upper, 4),
        "growth_pct_threshold": round((upper - 1) * 100, 2),
        "iterations": iterations,
        **evidence,
    }


def _emirate_zone_centroid(model: NetworkModel, emirate: str) -> tuple[float, float]:
    zones = [zone for zone in model.zones if zone.emirate == emirate]
    if zones:
        return (sum(z.lat for z in zones) / len(zones), sum(z.lon for z in zones) / len(zones))
    hubs = [hub for hub in model.hubs if hub.emirate == emirate]
    if hubs:
        return (sum(h.lat for h in hubs) / len(hubs), sum(h.lon for h in hubs) / len(hubs))
    raise ValueError(f"No zones or hubs found for emirate: {emirate!r}")


def _representative_customer_profile(model: NetworkModel, emirate: str) -> dict:
    zones = [zone for zone in model.zones if zone.emirate == emirate]
    if zones:
        demand = sum(z.demand for z in zones) / len(zones)
        sla_hours = Counter(z.sla_hours for z in zones).most_common(1)[0][0]
    else:
        demand = sum(z.demand for z in model.zones) / len(model.zones) if model.zones else 0.0
        sla_hours = DEFAULT_SLA_HOURS
    return {"demand": round(demand, 2), "sla_hours": sla_hours}


def _add_synthetic_customers(model: NetworkModel, emirate: str, count: int) -> NetworkModel:
    """Deterministic golden-angle spiral around the emirate's own zone
    centroid — no RNG, no hardcoded geography, so the same count always
    produces the same customers, and this works for any ingested dataset."""
    lat0, lon0 = _emirate_zone_centroid(model, emirate)
    profile = _representative_customer_profile(model, emirate)

    result = model
    for i in range(count):
        angle_deg = i * 137.507764  # golden angle -> evenly-spread spiral
        radius_deg = 0.01 * math.sqrt(i + 1)
        lat = lat0 + radius_deg * math.cos(math.radians(angle_deg))
        lon = lon0 + radius_deg * math.sin(math.radians(angle_deg))
        result = AddCustomerScenario().apply(
            result,
            {
                "id": f"CUST-{emirate}-{i + 1}",
                "name": f"Synthetic customer {i + 1} ({emirate})",
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "emirate": emirate,
                "demand": profile["demand"],
                "sla_hours": profile["sla_hours"],
            },
        )
    return result


def _service_level_at_customer_count(model: NetworkModel, emirate: str, count: int) -> dict:
    """A zone with SOME real flow but also some overflow still counts as
    "assigned" under `NetworkModel.assignments`' single-dominant-hub shape
    (T-02's trade-off), which would make the existing per-zone `coverage`
    metric misleadingly show 100% even with real unmet demand sitting in
    `flow.unmet_demand`. This computes a volume-weighted served_pct
    directly from the flow instead, so the number reported here always
    matches the `unmet_demand` evidence right next to it."""
    candidate = _add_synthetic_customers(model, emirate, count)
    flow = solve_min_cost_flow(candidate)
    total_demand = sum(candidate.demand.values())
    total_unmet = sum(flow.unmet_demand.values())
    served_pct = round((total_demand - total_unmet) / total_demand * 100, 4) if total_demand else 100.0
    return {"breaks": bool(flow.unmet_demand), "served_pct": served_pct, "unmet_demand": flow.unmet_demand}


def find_customer_count_break(
    model: NetworkModel, emirate: str, max_customer_count: int = DEFAULT_MAX_CUSTOMER_COUNT
) -> dict:
    baseline = _service_level_at_customer_count(model, emirate, 0)
    if baseline["breaks"]:
        return {
            "emirate": emirate,
            "threshold_found": True,
            "already_broken_at_current_demand": True,
            "customer_count_threshold": 0,
            "served_pct_at_threshold": baseline["served_pct"],
            "unmet_demand_at_threshold": baseline["unmet_demand"],
        }

    lower, upper = 0, 1
    while True:
        result = _service_level_at_customer_count(model, emirate, upper)
        if result["breaks"]:
            break
        if upper >= max_customer_count:
            return {
                "emirate": emirate,
                "threshold_found": False,
                "reason": (
                    f"Service level does not fail within {max_customer_count} added customers in {emirate}."
                ),
                "searched_up_to_customer_count": upper,
            }
        lower, upper = upper, upper * 2

    while upper - lower > 1:
        mid = (lower + upper) // 2
        result = _service_level_at_customer_count(model, emirate, mid)
        if result["breaks"]:
            upper = mid
        else:
            lower = mid

    result = _service_level_at_customer_count(model, emirate, upper)
    return {
        "emirate": emirate,
        "threshold_found": True,
        "already_broken_at_current_demand": False,
        "customer_count_threshold": upper,
        "served_pct_at_threshold": result["served_pct"],
        "unmet_demand_at_threshold": result["unmet_demand"],
        "representative_customer_profile": _representative_customer_profile(model, emirate),
    }
