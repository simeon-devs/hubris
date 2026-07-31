"""Shared helper: turn `NetworkModel.assignments` (single dominant hub per
zone) into total assigned volume per hub. Used by the KPI/cost metrics."""

from hubris.core.contracts import NetworkModel


def assigned_volume_by_hub(model: NetworkModel) -> dict[str, float]:
    assigned = {hub.id: 0.0 for hub in model.hubs}
    if not model.assignments:
        return assigned
    for zone_id, hub_id in model.assignments.items():
        assigned[hub_id] = assigned.get(hub_id, 0.0) + model.demand.get(zone_id, 0.0)
    return assigned
