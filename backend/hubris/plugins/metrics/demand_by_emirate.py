"""Per-emirate demand (dashboard bar chart). Registering it makes it appear
in GET /kpis and as an agent tool automatically — engine-side aggregation,
so no client ever sums zone demand itself (CLAUDE.md §2)."""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric


@register_metric
class DemandByEmirateMetric(Metric):
    name = "demand_by_emirate"
    unit = "parcels"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        per_emirate: dict[str, float] = {}
        for zone in model.zones:
            per_emirate[zone.emirate] = per_emirate.get(zone.emirate, 0.0) + model.demand.get(
                zone.id, 0.0
            )
        rounded = {emirate: round(demand, 2) for emirate, demand in per_emirate.items()}
        return MetricResult(
            name=self.name,
            value=round(sum(rounded.values()), 2),
            unit=self.unit,
            breakdown=rounded,
        )
