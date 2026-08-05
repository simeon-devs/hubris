"""Demand actually SERVED — the capacity-constrained companion to
`coverage` (Sims, 2026-08-05).

`coverage` answers "is every zone within SLA *reach* of its facility?" and
says 100% on the QComm crisis twin — correct for its definition, but on
stage it reads as a contradiction next to "17/day unmet". This metric
answers the other named quantity: what share of demand the min-cost flow
can actually serve under real capacities. On the crisis twin the two
together tell the true story: reachable 100%, served <100%, shortfall
listed per zone.
"""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric
from hubris.engine.flow import solve_min_cost_flow


@register_metric
class DemandServedMetric(Metric):
    name = "demand_served"
    unit = "%"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        flow = solve_min_cost_flow(model)
        total = sum(model.demand.values())
        unmet_by_zone = dict(flow.unmet_demand)
        unmet_total = sum(unmet_by_zone.values())
        served_pct = ((total - unmet_total) / total * 100) if total else 100.0

        zone_emirate = {zone.id: zone.emirate for zone in model.zones}
        demand_by_emirate: dict[str, float] = {}
        unmet_by_emirate: dict[str, float] = {}
        for zone in model.zones:
            demand_by_emirate[zone.emirate] = demand_by_emirate.get(zone.emirate, 0.0) + zone.demand
        for zone_id, unmet in unmet_by_zone.items():
            emirate = zone_emirate.get(zone_id, "unknown")
            unmet_by_emirate[emirate] = unmet_by_emirate.get(emirate, 0.0) + unmet

        per_emirate = {
            emirate: round(((total_e - unmet_by_emirate.get(emirate, 0.0)) / total_e * 100)
                           if total_e else 100.0, 2)
            for emirate, total_e in demand_by_emirate.items()
        }

        return MetricResult(
            name=self.name,
            value=round(served_pct, 2),
            unit=self.unit,
            breakdown={
                **per_emirate,
                "total_demand": round(total, 2),
                "served": round(total - unmet_total, 2),
                "unmet_total": round(unmet_total, 2),
                "unmet_by_zone": {z: round(v, 2) for z, v in sorted(unmet_by_zone.items())},
            },
        )
