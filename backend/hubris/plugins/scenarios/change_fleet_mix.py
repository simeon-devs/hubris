"""Adjust an existing fleet type's available vehicle count — BUILD_SPEC's
"change fleet mix?" scenario question. Takes an absolute count OR a delta
("+2 vans"). The fleet's own daily cost and trip capacity move with the
count and surface through /network's per-hub fleet aggregates; the
per-parcel variable rate does NOT move (vehicle running cost is calibrated
inside the file's own cost_per_shipment), and the UI says so."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class ChangeFleetMixScenario(ScenarioModule):
    name = "change_fleet_mix"
    params_schema = {
        "type": "object",
        "properties": {
            "fleet_type_id": {"type": "string"},
            "count_available": {"type": "integer", "description": "Absolute new count."},
            "count_delta": {"type": "integer", "description": "Vehicles added (+) / removed (-)."},
        },
        "required": ["fleet_type_id"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        fleet = next((f for f in copy.fleet_types if f.id == params["fleet_type_id"]), None)
        if fleet is None:
            raise ValueError(f"unknown fleet_type_id: {params['fleet_type_id']}")
        if params.get("count_available") is None and params.get("count_delta") is None:
            raise ValueError("provide count_available or count_delta")
        new_count = (
            int(params["count_available"])
            if params.get("count_available") is not None
            else fleet.count_available + int(params["count_delta"])
        )
        if new_count < 0:
            raise ValueError("cannot remove more vehicles than the fleet has")
        fleet.count_available = new_count
        return copy
