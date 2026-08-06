"""Merge two delivery areas into one consolidated run — "merging shipments"
as an honest, priceable lever: the merged zone's parcels are served AS PART
OF the absorbing zone's delivery run, so they take the absorbing zone's
corridor (distance, cost, SLA) and the merged zone disappears as a separate
stop. Demand is conserved; the flow engine re-prices the combined run.

Guardrails: same emirate and same service model only — merging a same-day
area into a next-day run would silently change the customer promise, and a
cross-emirate merge isn't one delivery run, it's a different network.
"""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class MergeZonesScenario(ScenarioModule):
    name = "merge_zones"
    params_schema = {
        "type": "object",
        "properties": {
            "absorbing_zone_id": {
                "type": "string",
                "description": "The zone whose delivery run takes on the merged parcels.",
            },
            "merged_zone_id": {
                "type": "string",
                "description": "The zone folded into the absorbing run (removed as a stop).",
            },
        },
        "required": ["absorbing_zone_id", "merged_zone_id"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        absorb_id = params["absorbing_zone_id"]
        merged_id = params["merged_zone_id"]
        if absorb_id == merged_id:
            raise ValueError("a zone cannot absorb itself")
        absorbing = next((z for z in copy.zones if z.id == absorb_id), None)
        merged = next((z for z in copy.zones if z.id == merged_id), None)
        if absorbing is None:
            raise ValueError(f"unknown absorbing_zone_id: {absorb_id}")
        if merged is None:
            raise ValueError(f"unknown merged_zone_id: {merged_id}")
        if absorbing.emirate != merged.emirate:
            raise ValueError(
                f"{merged.id} is in {merged.emirate}, {absorbing.id} in {absorbing.emirate} — "
                "one delivery run cannot span emirates"
            )
        if absorbing.service_model != merged.service_model:
            raise ValueError(
                "service models differ — merging would silently change the delivery promise"
            )

        # Parcels move onto the absorbing run; the merged stop disappears.
        absorbing.demand = round(absorbing.demand + merged.demand, 2)
        copy.zones = [z for z in copy.zones if z.id != merged_id]
        copy.demand.pop(merged_id, None)
        copy.demand[absorb_id] = absorbing.demand
        for key in [k for k in copy.od_matrix if k[1] == merged_id]:
            del copy.od_matrix[key]
        if copy.assignments:
            copy.assignments.pop(merged_id, None)
        return copy
