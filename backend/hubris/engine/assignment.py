"""Shared helpers around `NetworkModel.assignments` (single dominant hub per
zone): aggregating it for the KPI/cost metrics, and rebuilding it from a
fresh flow solve after a scenario changes the network's structure."""

from hubris.core.contracts import NetworkModel


def assigned_volume_by_hub(model: NetworkModel) -> dict[str, float]:
    assigned = {hub.id: 0.0 for hub in model.hubs}
    if not model.assignments:
        return assigned
    for zone_id, hub_id in model.assignments.items():
        assigned[hub_id] = assigned.get(hub_id, 0.0) + model.demand.get(zone_id, 0.0)
    return assigned


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
