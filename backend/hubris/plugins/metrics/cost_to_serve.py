"""Cost-to-serve (BUILD_SPEC §3): (Σ transport + allocated fixed) / Σ demand.

Computed from `NetworkModel.assignments` (the dominant hub per zone) — an
approximation where a zone's demand is not split across hubs, per the
confirmed trade-off in T-02. Fixed cost is charged for every open hub
regardless of whether it currently has flow (the CFLP objective always pays
f_j for an open hub)."""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric


@register_metric
class CostToServeMetric(Metric):
    name = "cost_to_serve"
    unit = "AED/parcel"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        assignments = model.assignments or {}
        zone_by_id = {zone.id: zone for zone in model.zones}

        transport_cost = 0.0
        per_emirate_transport: dict[str, float] = {}
        if model.flow_volumes is not None:
            # Scenario-derived models carry the LP's exact split volumes —
            # use them so transport cost matches the flow the map draws.
            for hub_id, zone_volumes in model.flow_volumes.items():
                for zone_id, volume in zone_volumes.items():
                    zone = zone_by_id.get(zone_id)
                    if zone is None:
                        continue
                    od = model.od_matrix.get((hub_id, zone_id))
                    cost = volume * od.cost if od else 0.0
                    transport_cost += cost
                    per_emirate_transport[zone.emirate] = (
                        per_emirate_transport.get(zone.emirate, 0.0) + cost
                    )
        else:
            for zone_id, hub_id in assignments.items():
                zone = zone_by_id[zone_id]
                od = model.od_matrix.get((hub_id, zone_id))
                cost = zone.demand * od.cost if od else 0.0
                transport_cost += cost
                per_emirate_transport[zone.emirate] = (
                    per_emirate_transport.get(zone.emirate, 0.0) + cost
                )

        fixed_cost = sum(hub.fixed_cost for hub in model.hubs if hub.status == "open")
        total_cost = transport_cost + fixed_cost
        total_demand = sum(model.demand.values())
        value = total_cost / total_demand if total_demand else 0.0

        return MetricResult(
            name=self.name,
            value=round(value, 4),
            unit=self.unit,
            breakdown={
                "transport_cost": round(transport_cost, 2),
                "fixed_cost": round(fixed_cost, 2),
                "total_cost": round(total_cost, 2),
                "total_demand": round(total_demand, 2),
                # Precomputed shares so an agent never has to divide these
                # itself to answer "what's driving cost?".
                "transport_cost_pct": round(transport_cost / total_cost * 100, 2) if total_cost else 0.0,
                "fixed_cost_pct": round(fixed_cost / total_cost * 100, 2) if total_cost else 0.0,
                "per_emirate_transport_cost": {
                    emirate: round(cost, 2) for emirate, cost in per_emirate_transport.items()
                },
            },
        )
