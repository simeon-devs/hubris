"""Prescriptive bottleneck unlock (T-23; BUILD_SPEC §5): turns the min-cost-
flow LP's duals (T-08) into an actionable recommendation — "the cheapest
way to unblock is +N units at Hub B, costing X, unlocking Y."

A dual is only exact for a SINGLE unit of relaxation (valid only until the
LP basis changes) — CLAUDE.md's determinism rule means we never extrapolate
that estimate to a realistically-sized unlock. Instead: duals cheaply
IDENTIFY which hubs are worth investigating, then a REAL re-solve with each
candidate's capacity actually raised confirms the true, verified cost
saving and exactly which zones reroute — every number reported is what the
LP genuinely produced when re-run, never a linear extrapolation.

Note this needs its OWN displacement helper rather than reusing T-21's
`find_displaced_zones` (which works off a single dominant-hub-per-zone
assignment): a zone whose demand is SPLIT across two hubs by a binding
capacity constraint (e.g. 20 units still at its cheapest hub, 10 units
pushed to a pricier one) has a dominant hub that IS still its cheapest
option, so T-21's zone-level view would miss exactly the displaced units
that matter here. This works directly off `flow.flows`' per-hub-per-zone
volumes instead, unit for unit.
"""

from pydantic import BaseModel

from hubris.core.contracts import NetworkModel
from hubris.engine.flow import FlowResult, solve_min_cost_flow

DUAL_EPSILON = 1e-6


class DisplacedVolume(BaseModel):
    zone_id: str
    volume: float
    actual_hub_id: str
    cheapest_hub_id: str
    excess_cost_per_unit: float
    excess_cost_total: float


class BottleneckUnlock(BaseModel):
    hub_id: str
    unlock_units: float
    new_capacity: float
    verified_cost_savings: float
    unlocked_zone_ids: list[str]


def find_binding_hubs(model: NetworkModel, flow: FlowResult) -> list[str]:
    return [
        hub.id
        for hub in model.hubs
        if hub.status == "open" and abs(flow.hub_duals.get(hub.id, 0.0)) > DUAL_EPSILON
    ]


def find_displaced_flow_volumes(model: NetworkModel, flow: FlowResult) -> list[DisplacedVolume]:
    """For every real (non-overflow) unit of flow: is the hub actually
    serving it the cheapest SLA-reachable option for that zone? Unlike
    T-21's zone-level view, this catches a PARTIALLY rerouted zone exactly
    — only the displaced slice, not the whole zone."""
    open_hubs = [hub for hub in model.hubs if hub.status == "open"]

    cheapest_by_zone: dict[str, tuple[str, float]] = {}
    for zone in model.zones:
        candidates = []
        for hub in open_hubs:
            od = model.od_matrix.get((hub.id, zone.id))
            if od is None or od.time_min > zone.sla_hours * 60:
                continue
            candidates.append((hub.id, od.cost))
        if candidates:
            cheapest_by_zone[zone.id] = min(candidates, key=lambda c: c[1])

    displaced: list[DisplacedVolume] = []
    for hub_id, zone_volumes in flow.flows.items():
        for zone_id, volume in zone_volumes.items():
            cheapest = cheapest_by_zone.get(zone_id)
            if cheapest is None:
                continue
            cheapest_hub_id, cheapest_cost = cheapest
            if cheapest_hub_id == hub_id:
                continue
            actual_cost = model.od_matrix[(hub_id, zone_id)].cost
            excess_per_unit = round(actual_cost - cheapest_cost, 4)
            if excess_per_unit <= 0:
                continue
            displaced.append(
                DisplacedVolume(
                    zone_id=zone_id,
                    volume=volume,
                    actual_hub_id=hub_id,
                    cheapest_hub_id=cheapest_hub_id,
                    excess_cost_per_unit=excess_per_unit,
                    excess_cost_total=round(excess_per_unit * volume, 2),
                )
            )
    return displaced


def find_cheapest_bottleneck_unlock(model: NetworkModel) -> dict:
    flow = solve_min_cost_flow(model)
    binding_hub_ids = find_binding_hubs(model, flow)
    if not binding_hub_ids:
        return {
            "bottleneck_found": False,
            "reason": "No hub capacity constraint is currently binding — nothing to unlock.",
        }

    displaced = find_displaced_flow_volumes(model, flow)
    displaced_by_origin_hub: dict[str, list[DisplacedVolume]] = {}
    for d in displaced:
        displaced_by_origin_hub.setdefault(d.cheapest_hub_id, []).append(d)

    hub_by_id = {hub.id: hub for hub in model.hubs}
    candidates: list[BottleneckUnlock] = []
    for hub_id in binding_hub_ids:
        zones_for_hub = displaced_by_origin_hub.get(hub_id, [])
        if not zones_for_hub:
            continue
        unlock_units = round(sum(d.volume for d in zones_for_hub), 2)

        trial_model = model.model_copy(deep=True)
        for hub in trial_model.hubs:
            if hub.id == hub_id:
                hub.capacity = round(hub.capacity + unlock_units, 4)
        trial_flow = solve_min_cost_flow(trial_model)
        verified_savings = round(flow.total_cost - trial_flow.total_cost, 2)
        if verified_savings <= 0:
            continue

        trial_hub_by_zone = {
            zone_id: h for h, zone_volumes in trial_flow.flows.items() for zone_id in zone_volumes
        }
        unlocked_zone_ids = sorted(
            {d.zone_id for d in zones_for_hub if trial_hub_by_zone.get(d.zone_id) == hub_id}
        )

        candidates.append(
            BottleneckUnlock(
                hub_id=hub_id,
                unlock_units=unlock_units,
                new_capacity=round(hub_by_id[hub_id].capacity + unlock_units, 2),
                verified_cost_savings=verified_savings,
                unlocked_zone_ids=unlocked_zone_ids,
            )
        )

    if not candidates:
        return {
            "bottleneck_found": False,
            "reason": (
                "Binding hub(s) found, but no candidate unlock produced a verified cost saving."
            ),
            "binding_hub_ids": binding_hub_ids,
        }

    best = max(candidates, key=lambda c: c.verified_cost_savings / c.unlock_units if c.unlock_units else 0.0)

    return {
        "bottleneck_found": True,
        "recommendation": best.model_dump(),
        "all_candidates": [c.model_dump() for c in candidates],
        "why": (
            f"Hub {best.hub_id} is capacity-constrained, forcing "
            f"{len(best.unlocked_zone_ids)} zone(s) onto a pricier route. Adding "
            f"{best.unlock_units} units of capacity there (to {best.new_capacity}) — "
            f"verified by re-solving the flow, not estimated — lets those zones "
            f"reroute back to {best.hub_id}, saving {best.verified_cost_savings} AED/period. "
            f"This is the cheapest verified unlock among {len(candidates)} candidate hub(s)."
        ),
    }
