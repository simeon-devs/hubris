"""Spare capacity: capacity - actual flow volume, per open hub and
network-wide. Answers BUILD_SPEC's "which hub has spare capacity? / can we
absorb a customer?" canonical planner question.

T-37: flow-based (same basis as utilization — the two share
`flow_volume_by_hub` so they can never diverge onto different
definitions). The assignment-based figure could go NEGATIVE for a hub the
dominant-hub collapse over-credited, which is nonsense for "room to absorb
a customer"; flow volume never exceeds capacity, so spare is never
negative while the network is feasible."""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric
from hubris.plugins.metrics.utilization import flow_volume_by_hub


@register_metric
class SpareCapacityMetric(Metric):
    name = "spare_capacity"
    unit = "parcels"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        volumes = flow_volume_by_hub(model)
        open_hubs = [hub for hub in model.hubs if hub.status == "open"]

        per_hub = {
            hub.id: round(hub.capacity - volumes.get(hub.id, 0.0), 2) for hub in open_hubs
        }
        total_spare = sum(per_hub.values())

        return MetricResult(
            name=self.name,
            value=round(total_spare, 2),
            unit=self.unit,
            breakdown=per_hub,
        )
