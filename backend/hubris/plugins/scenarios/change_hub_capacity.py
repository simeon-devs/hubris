"""Resize a hub — R3. Scales (or sets) one facility's daily capacity;
the flow/optimiser engine then shows where demand spills when a hub
shrinks below its load. Structural change only, per the T-10 convention:
reassignment happens in the flow re-solve, not here."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class ChangeHubCapacityScenario(ScenarioModule):
    name = "change_hub_capacity"
    params_schema = {
        "type": "object",
        "properties": {
            "hub_id": {"type": "string"},
            "factor": {
                "type": ["number", "null"],
                "description": "Multiplier on current capacity, e.g. 0.6 = -40%.",
            },
            "new_capacity": {
                "type": ["number", "null"],
                "description": "Absolute daily capacity; overrides factor when set.",
            },
        },
        "required": ["hub_id"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        hub = next((h for h in copy.hubs if h.id == params["hub_id"]), None)
        if hub is None:
            raise ValueError(f"unknown hub_id: {params['hub_id']}")
        new_capacity = params.get("new_capacity")
        factor = params.get("factor")
        if new_capacity is None:
            if factor is None:
                raise ValueError("provide factor or new_capacity")
            new_capacity = hub.capacity * float(factor)
        if new_capacity < 0:
            raise ValueError("capacity cannot be negative")
        hub.capacity = round(float(new_capacity), 2)
        return copy
