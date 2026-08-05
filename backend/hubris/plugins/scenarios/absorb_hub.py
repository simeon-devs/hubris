"""Absorb a micro hub into a bigger sibling — the consolidation move
planners actually discuss ("fold RAK into Sharjah"). Unlike close_hub,
where the building's capacity simply disappears, absorption CLOSES the
micro and MOVES its capacity and rider roster into the absorbing hub —
the people and throughput relocate, the rent does not.

`into_id` is optional: the default absorber is the nearest OPEN Full Hub
(same-day capable, so it can legally carry everything the micro carried);
if the model has no typed hubs (synthetic fixtures), nearest open hub.
Demand re-routing stays the flow engine's job on the resulting model."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario
from hubris.engine.geo import road_distance_km


def _merge_weighted(
    count_a: int | None, value_a: float | None, count_b: int | None, value_b: float | None
) -> float | None:
    """Count-weighted merge of a per-rider figure (avg dpd / weekly rate)."""
    pairs = [(c, v) for c, v in ((count_a, value_a), (count_b, value_b)) if c and v is not None]
    if not pairs:
        return value_a if value_a is not None else value_b
    total = sum(c for c, _ in pairs)
    return round(sum(c * v for c, v in pairs) / total, 2) if total else value_a


@register_scenario
class AbsorbHubScenario(ScenarioModule):
    name = "absorb_hub"
    params_schema = {
        "type": "object",
        "properties": {
            "micro_id": {
                "type": "string",
                "description": "Hub to close and fold into the absorber.",
            },
            "into_id": {
                "type": "string",
                "description": "Absorbing hub. Omit for the nearest open Full Hub.",
            },
        },
        "required": ["micro_id"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        micro = next((h for h in copy.hubs if h.id == params["micro_id"]), None)
        if micro is None:
            raise ValueError(f"unknown micro_id: {params['micro_id']}")
        if micro.status != "open":
            raise ValueError(f"{micro.id} is not open — nothing to absorb")

        into_id = params.get("into_id")
        if into_id:
            if into_id == micro.id:
                raise ValueError("a hub cannot absorb itself")
            into = next((h for h in copy.hubs if h.id == into_id), None)
            if into is None:
                raise ValueError(f"unknown into_id: {into_id}")
            if into.status != "open":
                raise ValueError(f"{into.id} is not open — it cannot absorb")
        else:
            open_others = [h for h in copy.hubs if h.status == "open" and h.id != micro.id]
            candidates = [h for h in open_others if h.hub_type == "Full Hub"] or open_others
            if not candidates:
                raise ValueError("no open hub left to absorb into")
            into = min(
                candidates, key=lambda h: road_distance_km(micro.lat, micro.lon, h.lat, h.lon)
            )

        micro.status = "closed"
        into.capacity = round(into.capacity + micro.capacity, 2)

        # The roster moves with the people. Per-rider figures merge
        # count-weighted so the absorber's dpd/rates stay honest.
        if micro.riders_fte is not None or micro.riders_ftc is not None:
            into.fte_avg_dpd = _merge_weighted(
                into.riders_fte, into.fte_avg_dpd, micro.riders_fte, micro.fte_avg_dpd
            )
            into.ftc_avg_dpd = _merge_weighted(
                into.riders_ftc, into.ftc_avg_dpd, micro.riders_ftc, micro.ftc_avg_dpd
            )
            into.fte_weekly_rate = _merge_weighted(
                into.riders_fte, into.fte_weekly_rate, micro.riders_fte, micro.fte_weekly_rate
            )
            into.ftc_weekly_rate = _merge_weighted(
                into.riders_ftc, into.ftc_weekly_rate, micro.riders_ftc, micro.ftc_weekly_rate
            )
            into.riders_fte = (into.riders_fte or 0) + (micro.riders_fte or 0)
            into.riders_ftc = (into.riders_ftc or 0) + (micro.riders_ftc or 0)
            if micro.rider_capacity_daily is not None:
                into.rider_capacity_daily = round(
                    (into.rider_capacity_daily or 0.0) + micro.rider_capacity_daily, 1
                )
            if micro.rider_weekly_cost is not None:
                into.rider_weekly_cost = round(
                    (into.rider_weekly_cost or 0.0) + micro.rider_weekly_cost, 2
                )
        return copy
