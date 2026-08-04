"""Shared helpers around `NetworkModel.assignments` (single dominant hub per
zone): aggregating it for the KPI/cost metrics, and rebuilding it from a
fresh flow solve after a scenario changes the network's structure."""

from hubris.core.contracts import NetworkModel


def assigned_volume_by_hub(model: NetworkModel) -> dict[str, float]:
    assigned = {hub.id: 0.0 for hub in model.hubs}
    # Flow-true volumes, when the model carries them (scenario-derived models
    # do): the exact split the LP found, so no hub is overcounted past its
    # capacity by the dominant-hub collapse.
    if model.flow_volumes is not None:
        for hub_id, zone_volumes in model.flow_volumes.items():
            assigned[hub_id] = assigned.get(hub_id, 0.0) + sum(zone_volumes.values())
        return assigned
    if not model.assignments:
        return assigned
    for zone_id, hub_id in model.assignments.items():
        assigned[hub_id] = assigned.get(hub_id, 0.0) + model.demand.get(zone_id, 0.0)
    return assigned


def cost_to_serve_by_hub(model: NetworkModel) -> dict[str, float]:
    """Per-hub cost-to-serve rate (AED/parcel of that hub's own assigned
    demand): (hub fixed_cost + its assigned transport cost) / its assigned
    volume. 0.0 for a hub with no assigned demand — used by the map
    tooltip (T-16), computed server-side so the frontend never derives it."""
    assignments = model.assignments or {}
    zone_by_id = {zone.id: zone for zone in model.zones}

    transport_by_hub: dict[str, float] = {}
    if model.flow_volumes is not None:
        # Attribute transport cost by the exact flow split, consistent with
        # assigned_volume_by_hub above.
        for hub_id, zone_volumes in model.flow_volumes.items():
            for zone_id, volume in zone_volumes.items():
                od = model.od_matrix.get((hub_id, zone_id))
                cost = volume * od.cost if od else 0.0
                transport_by_hub[hub_id] = transport_by_hub.get(hub_id, 0.0) + cost
    else:
        for zone_id, hub_id in assignments.items():
            zone = zone_by_id[zone_id]
            od = model.od_matrix.get((hub_id, zone_id))
            cost = zone.demand * od.cost if od else 0.0
            transport_by_hub[hub_id] = transport_by_hub.get(hub_id, 0.0) + cost

    assigned = assigned_volume_by_hub(model)
    result: dict[str, float] = {}
    for hub in model.hubs:
        volume = assigned.get(hub.id, 0.0)
        if volume <= 0:
            result[hub.id] = 0.0
            continue
        total = hub.fixed_cost + transport_by_hub.get(hub.id, 0.0)
        result[hub.id] = round(total / volume, 4)
    return result


def dominant_hub_per_zone(flows: dict[str, dict[str, float]]) -> dict[str, str]:
    """Collapse a flow result's `hub_id -> zone_id -> volume` into the
    single-dominant-hub-per-zone shape `NetworkModel.assignments` expects
    (mirrors `NetworkModel.from_raw_tables`'s resolution for split rows)."""
    best_volume: dict[str, float] = {}
    assignments: dict[str, str] = {}
    for hub_id, zone_volumes in flows.items():
        for zone_id, volume in zone_volumes.items():
            if volume > best_volume.get(zone_id, float("-inf")):
                best_volume[zone_id] = volume
                assignments[zone_id] = hub_id
    return assignments
