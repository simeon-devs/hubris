"""Opportunity scanner (T-21; BUILD_SPEC §5): finds inefficiencies nobody
asked about, each backed by a real computed figure — never a hunch. Three
inefficiency types, each engine-derived from the current network state:

1. Overlapping coverage — two open hubs whose PRIMARY (cost-competitive,
   not just SLA-reachable) catchments overlap heavily, a sign of redundant
   coverage that could be consolidated.
2. Far-hub service — a zone whose CURRENT assignment isn't its cheapest
   available hub (e.g. a distance-nearest baseline picked a hub that isn't
   cost-cheapest once handling_cost/cost_per_km differ), paying an
   avoidable premium. Shared with T-23's bottleneck unlock, which sources
   the same helper from a flow solve instead to find capacity-driven
   displacement.
3. Idle-next-to-overload — an open hub running hot relative to the
   network's own average utilization, next to another open hub sitting
   well below it — a rebalancing opportunity.

Every `why` string below is built by plain Python string formatting from
numbers already in the returned dict — never LLM-generated — so the
opportunity scanner is safe to surface even with no agent in the loop.
"""

from pydantic import BaseModel

from hubris.core.contracts import NetworkModel
from hubris.core.models import Hub
from hubris.engine.geo import road_distance_km
from hubris.plugins.metrics.spare_capacity import SpareCapacityMetric
from hubris.plugins.metrics.utilization import UtilizationMetric

MIN_OVERLAP_ZONES = 3  # below this, two hubs sharing a couple of edge zones is normal, not redundant
PRIMARY_COST_RATIO = 1.15  # a hub is a zone's "primary" option within 15% of the cheapest cost
MIN_EXCESS_COST_PER_UNIT = 1.0  # AED/parcel; filters out solver rounding noise, not real premiums
# "Overloaded"/"idle" are relative to the network's OWN average utilization,
# not a fixed absolute number — a healthy network running at 15% average
# still has a genuine rebalancing opportunity if one hub runs at 2x that
# while another sits at half, and an absolute 80%/40% cutoff would miss it
# entirely on an under-utilized network (or over-fire on a busy one).
HIGH_UTILIZATION_RATIO = 1.5  # >= 1.5x the network average
LOW_UTILIZATION_RATIO = 0.75  # <= 0.75x the network average
MIN_OVERLOADED_UTILIZATION_PCT = 10.0  # floor so near-zero-everywhere networks don't flag noise
NEARBY_KM = 120.0  # UAE is compact enough that this comfortably spans within-emirate pairs


class DisplacedZone(BaseModel):
    zone_id: str
    demand: float
    actual_hub_id: str
    actual_cost: float
    cheapest_hub_id: str
    cheapest_cost: float
    excess_cost_per_unit: float
    excess_cost_total: float


def find_displaced_zones(
    model: NetworkModel, actual_hub_by_zone: dict[str, str]
) -> list[DisplacedZone]:
    """Zones served (per `actual_hub_by_zone`) by a hub that ISN'T their
    cheapest SLA-reachable open hub. Takes the assignment as a plain dict so
    callers can source it from either the CURRENT status-quo assignment
    (`model.assignments` — T-21's "as-is" inefficiency) or a specific flow
    solve's own routing (`dominant_hub_per_zone(flow.flows)` — T-23's
    capacity-binding bottleneck, a different question)."""
    open_hubs = [hub for hub in model.hubs if hub.status == "open"]

    displaced: list[DisplacedZone] = []
    for zone in model.zones:
        actual_hub_id = actual_hub_by_zone.get(zone.id)
        if actual_hub_id is None:
            continue  # unmet demand, not a "wrong hub" — a different problem

        candidates = []
        for hub in open_hubs:
            od = model.od_matrix.get((hub.id, zone.id))
            if od is None or od.time_min > zone.sla_hours * 60:
                continue
            candidates.append((hub.id, od.cost))
        if not candidates:
            continue

        cheapest_hub_id, cheapest_cost = min(candidates, key=lambda c: c[1])
        actual_cost = model.od_matrix[(actual_hub_id, zone.id)].cost
        excess_per_unit = round(actual_cost - cheapest_cost, 4)
        if cheapest_hub_id == actual_hub_id or excess_per_unit < MIN_EXCESS_COST_PER_UNIT:
            continue

        displaced.append(
            DisplacedZone(
                zone_id=zone.id,
                demand=zone.demand,
                actual_hub_id=actual_hub_id,
                actual_cost=actual_cost,
                cheapest_hub_id=cheapest_hub_id,
                cheapest_cost=cheapest_cost,
                excess_cost_per_unit=excess_per_unit,
                excess_cost_total=round(excess_per_unit * zone.demand, 2),
            )
        )
    return displaced


def _primary_catchment_by_hub(model: NetworkModel, open_hubs: list[Hub]) -> dict[str, set[str]]:
    """A hub is a zone's "primary" option if it's SLA-reachable AND within
    `PRIMARY_COST_RATIO` of the cheapest available cost for that zone — a
    much tighter (and more meaningful) notion of "coverage" than mere SLA
    reachability, which UAE's generous 24h SLA windows make nearly universal
    for any hub pair regardless of distance."""
    catchment: dict[str, set[str]] = {hub.id: set() for hub in open_hubs}
    for zone in model.zones:
        candidates = []
        for hub in open_hubs:
            od = model.od_matrix.get((hub.id, zone.id))
            if od is None or od.time_min > zone.sla_hours * 60:
                continue
            candidates.append((hub.id, od.cost))
        if not candidates:
            continue
        cheapest_cost = min(cost for _, cost in candidates)
        for hub_id, cost in candidates:
            if cost <= cheapest_cost * PRIMARY_COST_RATIO:
                catchment[hub_id].add(zone.id)
    return catchment


def find_overlapping_coverage(model: NetworkModel) -> list[dict]:
    open_hubs = [hub for hub in model.hubs if hub.status == "open"]
    coverage = _primary_catchment_by_hub(model, open_hubs)

    findings = []
    for i, hub_a in enumerate(open_hubs):
        for hub_b in open_hubs[i + 1 :]:
            overlap = coverage[hub_a.id] & coverage[hub_b.id]
            if len(overlap) < MIN_OVERLAP_ZONES:
                continue
            overlap_demand = round(sum(model.demand.get(z, 0.0) for z in overlap), 2)
            distance_km = round(road_distance_km(hub_a.lat, hub_a.lon, hub_b.lat, hub_b.lon), 1)
            findings.append(
                {
                    "type": "overlapping_coverage",
                    "hub_a_id": hub_a.id,
                    "hub_b_id": hub_b.id,
                    "overlap_zone_count": len(overlap),
                    "overlap_zone_ids": sorted(overlap),
                    "overlap_demand": overlap_demand,
                    "distance_km": distance_km,
                    "why": (
                        f"{hub_a.id} and {hub_b.id} are both cost-competitive (within "
                        f"{int((PRIMARY_COST_RATIO - 1) * 100)}% of the cheapest option) for "
                        f"{len(overlap)} of the same zones ({overlap_demand} parcels/period of "
                        f"demand), {distance_km}km apart — redundant coverage that could be "
                        f"consolidated onto one hub."
                    ),
                }
            )
    findings.sort(key=lambda f: f["overlap_demand"], reverse=True)
    return findings


def find_far_hub_service(model: NetworkModel) -> list[dict]:
    """Zones in the CURRENT operational assignment (`model.assignments` —
    e.g. the ingested status-quo, or a nearest-by-DISTANCE baseline) that
    aren't at their cheapest-by-COST hub. "Nearest" and "cheapest" diverge
    whenever handling_cost/cost_per_km vary by hub, which is exactly the
    kind of thing a planner wouldn't catch by eyeballing a map."""
    displaced = find_displaced_zones(model, model.assignments or {})
    findings = [
        {
            "type": "far_hub_service",
            "zone_id": d.zone_id,
            "actual_hub_id": d.actual_hub_id,
            "cheapest_hub_id": d.cheapest_hub_id,
            "excess_cost_per_unit": d.excess_cost_per_unit,
            "excess_cost_total": d.excess_cost_total,
            "why": (
                f"Zone {d.zone_id} is currently served by {d.actual_hub_id} at "
                f"{d.actual_cost} AED/parcel, but {d.cheapest_hub_id} could serve it "
                f"for {d.cheapest_cost} AED/parcel instead — a "
                f"{d.excess_cost_total} AED/period avoidable premium."
            ),
        }
        for d in displaced
    ]
    findings.sort(key=lambda f: f["excess_cost_total"], reverse=True)
    return findings


def find_idle_next_to_overload(
    model: NetworkModel, utilization_by_hub: dict[str, float], spare_by_hub: dict[str, float]
) -> list[dict]:
    """Flags hub pairs where one runs hot RELATIVE TO THE NETWORK'S OWN
    AVERAGE utilization while a nearby hub sits well below it — relative,
    not an absolute cutoff, so this fires on a lightly-loaded network (spot
    the imbalance) as readily as a busy one (spot the real overload)."""
    open_hubs = [hub for hub in model.hubs if hub.status == "open"]
    if not open_hubs:
        return []
    network_avg = sum(utilization_by_hub.get(h.id, 0.0) for h in open_hubs) / len(open_hubs)
    high_cutoff = max(network_avg * HIGH_UTILIZATION_RATIO, MIN_OVERLOADED_UTILIZATION_PCT)
    low_cutoff = network_avg * LOW_UTILIZATION_RATIO

    findings = []
    for overloaded in open_hubs:
        if utilization_by_hub.get(overloaded.id, 0.0) < high_cutoff:
            continue
        for idle in open_hubs:
            if idle.id == overloaded.id or utilization_by_hub.get(idle.id, 100.0) > low_cutoff:
                continue
            distance_km = round(
                road_distance_km(overloaded.lat, overloaded.lon, idle.lat, idle.lon), 1
            )
            if distance_km > NEARBY_KM:
                continue
            findings.append(
                {
                    "type": "idle_next_to_overload",
                    "overloaded_hub_id": overloaded.id,
                    "overloaded_utilization_pct": utilization_by_hub[overloaded.id],
                    "idle_hub_id": idle.id,
                    "idle_utilization_pct": utilization_by_hub.get(idle.id, 0.0),
                    "idle_spare_capacity": spare_by_hub.get(idle.id, 0.0),
                    "network_avg_utilization_pct": round(network_avg, 2),
                    "distance_km": distance_km,
                    "why": (
                        f"{overloaded.id} is running at {utilization_by_hub[overloaded.id]}% "
                        f"utilization — well above the network average of "
                        f"{round(network_avg, 1)}% — while {idle.id}, only {distance_km}km "
                        f"away, sits at {utilization_by_hub.get(idle.id, 0.0)}% with "
                        f"{spare_by_hub.get(idle.id, 0.0)} parcels of spare capacity — "
                        f"rebalancing demand toward {idle.id} would relieve {overloaded.id} "
                        f"without adding network capacity."
                    ),
                }
            )
    findings.sort(key=lambda f: f["idle_spare_capacity"], reverse=True)
    return findings


def scan_opportunities(model: NetworkModel) -> dict:
    utilization = UtilizationMetric().compute(model, None).breakdown or {}
    spare = SpareCapacityMetric().compute(model, None).breakdown or {}

    overlapping = find_overlapping_coverage(model)
    far_hub = find_far_hub_service(model)
    idle_overload = find_idle_next_to_overload(model, utilization, spare)

    return {
        "overlapping_coverage": overlapping,
        "far_hub_service": far_hub,
        "idle_next_to_overload": idle_overload,
        "total_opportunities": len(overlapping) + len(far_hub) + len(idle_overload),
        "inefficiency_types_found": sum(
            1 for findings in (overlapping, far_hub, idle_overload) if findings
        ),
    }
