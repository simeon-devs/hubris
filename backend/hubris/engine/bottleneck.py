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

TWO KINDS OF UNLOCK (2026-08-06 fix). The cost-saving search above is the
wrong question when the network cannot serve all its demand: clearing
unserved parcels *raises* real transport cost (you are now moving parcels
you previously moved not at all), so a saving-ranked search filters the
feasibility fix out and recommends a cheaper reroute in some other emirate
— which is what the QComm crisis alert did (unserved demand in Abu Dhabi,
recommended capacity in Dubai). So:

* infeasible flow  -> `restore_feasibility`: rank by unserved demand
  actually cleared in a verified re-solve. Report the ADDED transport cost
  honestly; never call it a saving.
* feasible flow    -> `reduce_cost`: the original dual-guided search.

Both kinds carry `kind` so every consumer (alert card, /bottleneck, agent
tool, MCP) reads the same recommendation without its own branch.
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


class FeasibilityUnlock(BaseModel):
    """The fix for demand that is not served AT ALL. Deliberately has no
    `verified_cost_savings` field: serving previously-unserved parcels costs
    MORE, and `added_transport_cost` says so in the open."""

    hub_id: str
    unlock_units: float
    new_capacity: float
    unmet_cleared: float
    unmet_remaining: float
    served_zone_ids: list[str]
    added_transport_cost: float


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


def find_cheapest_feasibility_unlock(model: NetworkModel, flow: FlowResult | None = None) -> dict:
    """The fix for UNSERVED demand: which single open facility, given more
    capacity, actually lets the flow serve the parcels it currently drops?

    Only facilities that can reach an unmet zone within that zone's own SLA
    are candidates — a store three hours away cannot fix a 15-minute
    promise, however much capacity it is given. Each candidate is verified
    by a real re-solve; `unmet_cleared` is what the LP genuinely served.
    """
    flow = flow if flow is not None else solve_min_cost_flow(model)
    if not flow.unmet_demand:
        return {
            "bottleneck_found": False,
            "reason": "Every parcel is served — there is no unserved demand to unlock.",
        }

    unmet_before = round(sum(flow.unmet_demand.values()), 2)
    zone_by_id = {zone.id: zone for zone in model.zones}
    open_hubs = [hub for hub in model.hubs if hub.status == "open"]

    # Each reachable facility's candidate size = all the unmet demand it
    # could legally take. (A hub reachable from an unmet zone is necessarily
    # at capacity, else the LP would already have used it.)
    units_by_hub: dict[str, float] = {}
    for zone_id, missing in flow.unmet_demand.items():
        zone = zone_by_id.get(zone_id)
        if zone is None:
            continue
        for hub in open_hubs:
            od = model.od_matrix.get((hub.id, zone_id))
            if od is None or od.time_min > zone.sla_hours * 60:
                continue
            units_by_hub[hub.id] = round(units_by_hub.get(hub.id, 0.0) + missing, 2)

    if not units_by_hub:
        unreachable = ", ".join(sorted(flow.unmet_demand))
        return {
            "bottleneck_found": False,
            "reason": (
                f"No OPEN facility can reach {unreachable} within its promised delivery "
                "time, so no amount of added capacity fixes this — it needs a new site."
            ),
            "unmet_demand": flow.unmet_demand,
        }

    hub_by_id = {hub.id: hub for hub in model.hubs}
    candidates: list[FeasibilityUnlock] = []
    for hub_id, unlock_units in units_by_hub.items():
        trial_model = model.model_copy(deep=True)
        for hub in trial_model.hubs:
            if hub.id == hub_id:
                hub.capacity = round(hub.capacity + unlock_units, 4)
        trial_flow = solve_min_cost_flow(trial_model)

        unmet_after = round(sum(trial_flow.unmet_demand.values()), 2)
        cleared = round(unmet_before - unmet_after, 2)
        if cleared <= 0:
            continue

        candidates.append(
            FeasibilityUnlock(
                hub_id=hub_id,
                unlock_units=unlock_units,
                new_capacity=round(hub_by_id[hub_id].capacity + unlock_units, 2),
                unmet_cleared=cleared,
                unmet_remaining=unmet_after,
                served_zone_ids=sorted(
                    zone_id
                    for zone_id in flow.unmet_demand
                    if trial_flow.unmet_demand.get(zone_id, 0.0) < flow.unmet_demand[zone_id]
                ),
                # Serving more parcels costs more. Stated, never hidden.
                added_transport_cost=round(trial_flow.total_cost - flow.total_cost, 2),
            )
        )

    if not candidates:
        return {
            "bottleneck_found": False,
            "reason": (
                "Capacity was added at every reachable facility and the flow still could "
                "not serve the demand — the shortfall is structural, not a single unlock."
            ),
            "unmet_demand": flow.unmet_demand,
        }

    # Clear the most demand; then the smallest capacity add; then the
    # cheapest to run; then hub id, so the answer is fully deterministic.
    best = min(
        candidates,
        key=lambda c: (-c.unmet_cleared, c.unlock_units, c.added_transport_cost, c.hub_id),
    )
    zones_phrase = ", ".join(best.served_zone_ids).replace("_", " ") or "the unserved zones"
    remaining = (
        f" {best.unmet_remaining} unit(s)/day remain unserved and need a separate fix."
        if best.unmet_remaining > 0
        else " That clears the shortfall completely."
    )

    return {
        "bottleneck_found": True,
        "kind": "restore_feasibility",
        "recommendation": best.model_dump(),
        "all_candidates": [c.model_dump() for c in candidates],
        "why": (
            f"{unmet_before} unit(s)/day of demand cannot be served at all. {best.hub_id} is "
            f"the facility that fixes the most of it: adding {best.unlock_units} units of "
            f"capacity there (to {best.new_capacity}) serves {best.unmet_cleared} unit(s)/day "
            f"in {zones_phrase} — verified by re-solving the flow, not estimated.{remaining} "
            f"Serving that demand ADDS {best.added_transport_cost} AED/period of transport "
            f"cost; this fix buys service, not savings. Chosen from "
            f"{len(candidates)} reachable candidate facility(ies)."
        ),
    }


def find_cheapest_bottleneck_unlock(model: NetworkModel) -> dict:
    flow = solve_min_cost_flow(model)

    # Unserved demand outranks a cheaper reroute: a saving-ranked search
    # cannot see the feasibility fix at all (clearing unmet demand raises
    # real cost), so asking it first is what put a Dubai recommendation on
    # an Abu Dhabi shortfall. If nothing restores feasibility we return that
    # verdict too, rather than changing the subject to a cost saving in an
    # emirate that is not the one dropping parcels.
    if flow.unmet_demand:
        return find_cheapest_feasibility_unlock(model, flow)

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
        "kind": "reduce_cost",
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
