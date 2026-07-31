"""Spare capacity: capacity - assigned volume, per open hub and network-wide.
Answers BUILD_SPEC's "which hub has spare capacity? / can we absorb a
customer?" canonical planner question."""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric
from hubris.engine.assignment import assigned_volume_by_hub


@register_metric
class SpareCapacityMetric(Metric):
    name = "spare_capacity"
    unit = "parcels"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        assigned = assigned_volume_by_hub(model)
        open_hubs = [hub for hub in model.hubs if hub.status == "open"]

        per_hub = {
            hub.id: round(hub.capacity - assigned.get(hub.id, 0.0), 2) for hub in open_hubs
        }
        total_spare = sum(per_hub.values())

        return MetricResult(
            name=self.name,
            value=round(total_spare, 2),
            unit=self.unit,
            breakdown=per_hub,
        )
