"""Utilisation (BUILD_SPEC §3): u_j = (Σ_i x_ij) / Q_j, per hub, plus a
capacity-weighted network average.

T-37: computed from the FLOW SOLVE's actual volumes, not from
`NetworkModel.assignments`. The dominant-hub assignment collapse (T-02)
credits a split zone's ENTIRE demand to one hub, which can read >100% while
the real flow sits at exactly capacity (observed live: H5 at "107.67%" on
the demo scenario vs a feasible flow at 100.0%). Flow volumes respect the
capacity constraint by construction, so this metric can never exceed 100
while the network is feasible. The assignment-based share still exists —
explicitly named `assignment_share_pct` in the /network response — but it
is an attribution view, not utilisation."""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric
from hubris.engine.flow import solve_min_cost_flow


def flow_volume_by_hub(model: NetworkModel) -> dict[str, float]:
    """Actual per-hub volume from a fresh flow solve — the shared basis for
    utilisation and spare capacity (kept together so the two can never
    silently diverge onto different definitions again)."""
    flow = solve_min_cost_flow(model)
    return {hub_id: sum(zones.values()) for hub_id, zones in flow.flows.items()}


@register_metric
class UtilizationMetric(Metric):
    name = "utilization"
    unit = "%"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        volumes = flow_volume_by_hub(model)
        open_hubs = [hub for hub in model.hubs if hub.status == "open"]

        total_capacity = sum(hub.capacity for hub in open_hubs)
        total_volume = sum(volumes.get(hub.id, 0.0) for hub in open_hubs)
        network_utilization = (total_volume / total_capacity * 100) if total_capacity else 0.0

        per_hub = {
            hub.id: round((volumes.get(hub.id, 0.0) / hub.capacity * 100) if hub.capacity else 0.0, 2)
            for hub in open_hubs
        }

        return MetricResult(
            name=self.name,
            value=round(network_utilization, 2),
            unit=self.unit,
            breakdown=per_hub,
        )
