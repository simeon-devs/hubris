"""Utilisation (BUILD_SPEC §3): u_j = (Σ_i x_ij) / Q_j, per hub, plus a
capacity-weighted network average."""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric
from hubris.engine.assignment import assigned_volume_by_hub


@register_metric
class UtilizationMetric(Metric):
    name = "utilization"
    unit = "%"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        assigned = assigned_volume_by_hub(model)
        open_hubs = [hub for hub in model.hubs if hub.status == "open"]

        total_capacity = sum(hub.capacity for hub in open_hubs)
        total_assigned = sum(assigned.get(hub.id, 0.0) for hub in open_hubs)
        network_utilization = (total_assigned / total_capacity * 100) if total_capacity else 0.0

        per_hub = {
            hub.id: round((assigned.get(hub.id, 0.0) / hub.capacity * 100) if hub.capacity else 0.0, 2)
            for hub in open_hubs
        }

        return MetricResult(
            name=self.name,
            value=round(network_utilization, 2),
            unit=self.unit,
            breakdown=per_hub,
        )
