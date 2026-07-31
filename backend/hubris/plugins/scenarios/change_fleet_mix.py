"""Adjust an existing fleet type's available vehicle count — BUILD_SPEC's
"change fleet mix?" scenario question."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class ChangeFleetMixScenario(ScenarioModule):
    name = "change_fleet_mix"
    params_schema = {
        "type": "object",
        "properties": {
            "fleet_type_id": {"type": "string"},
            "count_available": {"type": "integer"},
        },
        "required": ["fleet_type_id", "count_available"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        fleet = next(f for f in copy.fleet_types if f.id == params["fleet_type_id"])
        fleet.count_available = params["count_available"]
        return copy
