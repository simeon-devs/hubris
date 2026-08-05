"""Right-size the riders at a hub — R3, needs the R2 roster. Adds or
removes FTE/FTC riders and recomputes the hub's rider capacity and weekly
labour cost from the roster's own per-type figures (avg deliveries/day and
weekly rate — real Courier_Capacity data, e.g. FTE 3,200 vs FTC 2,400
AED/week at ~equal productivity). The capacity and cost effects then show
up through the ordinary metrics (courier_utilization, rider fields on
/network); demand routing is untouched — riders are a staffing lever, not
a network-shape lever."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class ChangeWorkforceScenario(ScenarioModule):
    name = "change_workforce"
    params_schema = {
        "type": "object",
        "properties": {
            "hub_id": {"type": "string"},
            "fte_delta": {"type": "integer", "description": "Riders added (+) or removed (-)."},
            "ftc_delta": {"type": "integer", "description": "Contract riders added (+) or removed (-)."},
        },
        "required": ["hub_id"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        hub = next((h for h in copy.hubs if h.id == params["hub_id"]), None)
        if hub is None:
            raise ValueError(f"unknown hub_id: {params['hub_id']}")
        if hub.riders_fte is None or hub.rider_capacity_daily is None:
            raise ValueError(f"{hub.id} has no rider roster — this dataset carries none")

        fte_delta = int(params.get("fte_delta") or 0)
        ftc_delta = int(params.get("ftc_delta") or 0)
        new_fte = hub.riders_fte + fte_delta
        new_ftc = (hub.riders_ftc or 0) + ftc_delta
        if new_fte < 0 or new_ftc < 0:
            raise ValueError("cannot remove more riders than the hub has")

        # Per-type figures straight from the roster; a type the hub never had
        # falls back to its counterpart's figures (documented derivation).
        fte_dpd = hub.fte_avg_dpd or hub.ftc_avg_dpd or 0.0
        ftc_dpd = hub.ftc_avg_dpd or hub.fte_avg_dpd or 0.0
        fte_rate = hub.fte_weekly_rate or hub.ftc_weekly_rate or 0.0
        ftc_rate = hub.ftc_weekly_rate or hub.fte_weekly_rate or 0.0

        hub.riders_fte = new_fte
        hub.riders_ftc = new_ftc
        hub.rider_capacity_daily = round(
            hub.rider_capacity_daily + fte_delta * fte_dpd + ftc_delta * ftc_dpd, 1
        )
        if hub.rider_weekly_cost is not None:
            hub.rider_weekly_cost = round(
                hub.rider_weekly_cost + fte_delta * fte_rate + ftc_delta * ftc_rate, 2
            )
        return copy
