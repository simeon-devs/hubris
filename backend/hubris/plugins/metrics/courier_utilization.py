"""Courier (rider) utilisation — R2, the judges' "use the drivers to full
capacity" question as a metric.

Basis: the REAL roster from the dataset's Courier_Capacity sheet
(riders × their own avg deliveries/day, per facility) against the actual
flow volume. This is deliberately a different quantity from facility
throughput utilisation — a hub can be 4% busy as a building while its
riders are 90% booked, or vice versa.

Honesty note (surfaced in the breakdown): the file's own
Network_Performance sheet reports "courier utilisation" of 84–93% for
hubs whose roster maths (volume ÷ riders×dpd) yields single digits — the
file disagrees with itself. We serve the official figures verbatim at
/event/metrics labelled "provided", and THIS metric computes the roster
basis; both are shown, labelled, never blended (the two-quantities
discipline).

Facilities without a roster (candidates, synthetic datasets) are skipped;
on a network with no roster at all the metric degrades to value 0 with an
explanatory breakdown, never an error.
"""

from hubris.core.contracts import Metric, MetricResult, NetworkModel
from hubris.core.registry import register_metric
from hubris.plugins.metrics.utilization import flow_volume_by_hub


@register_metric
class CourierUtilizationMetric(Metric):
    name = "courier_utilization"
    unit = "%"

    def compute(self, model: NetworkModel, scenario_id: str | None = None) -> MetricResult:
        volumes = flow_volume_by_hub(model)
        rostered = [
            hub for hub in model.hubs
            if hub.status == "open" and hub.rider_capacity_daily
        ]
        if not rostered:
            return MetricResult(
                name=self.name,
                value=0.0,
                unit=self.unit,
                breakdown={"note": "no rider roster in this dataset", "per_hub": {}},
            )

        per_hub = {
            hub.id: round(volumes.get(hub.id, 0.0) / hub.rider_capacity_daily * 100, 2)
            for hub in rostered
        }
        total_capacity = sum(hub.rider_capacity_daily for hub in rostered)
        total_volume = sum(volumes.get(hub.id, 0.0) for hub in rostered)

        return MetricResult(
            name=self.name,
            value=round(total_volume / total_capacity * 100, 2) if total_capacity else 0.0,
            unit=self.unit,
            breakdown={
                "per_hub": per_hub,
                "total_rider_capacity_daily": round(total_capacity, 1),
                "total_flow_volume_daily": round(total_volume, 2),
                "basis": (
                    "roster-computed: flow volume / (riders x their avg deliveries/day). "
                    "The dataset's own official courier-utilisation figures (Network_"
                    "Performance) disagree with its roster maths; official values are "
                    "served verbatim at /event/metrics, labelled provided."
                ),
            },
        )
