"""Coverage: % of demand served within its zone's SLA window, per BUILD_SPEC
§3's "coverage %?" canonical question (maximal-covering-style check)."""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric


@register_metric
class CoverageMetric(Metric):
    name = "coverage"
    unit = "%"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        assignments = model.assignments or {}
        zone_by_id = {zone.id: zone for zone in model.zones}

        demand_by_emirate: dict[str, float] = {}
        for zone in model.zones:
            demand_by_emirate[zone.emirate] = demand_by_emirate.get(zone.emirate, 0.0) + zone.demand

        covered_demand = 0.0
        covered_by_emirate: dict[str, float] = {}
        for zone_id, hub_id in assignments.items():
            zone = zone_by_id[zone_id]
            od = model.od_matrix.get((hub_id, zone_id))
            within_sla = od is not None and od.time_min <= zone.sla_hours * 60
            if within_sla:
                covered_demand += zone.demand
                covered_by_emirate[zone.emirate] = (
                    covered_by_emirate.get(zone.emirate, 0.0) + zone.demand
                )

        total_demand = sum(model.demand.values())
        coverage_pct = (covered_demand / total_demand * 100) if total_demand else 0.0

        breakdown = {
            emirate: round((covered_by_emirate.get(emirate, 0.0) / total * 100) if total else 0.0, 2)
            for emirate, total in demand_by_emirate.items()
        }

        return MetricResult(
            name=self.name,
            value=round(coverage_pct, 2),
            unit=self.unit,
            breakdown=breakdown,
        )
