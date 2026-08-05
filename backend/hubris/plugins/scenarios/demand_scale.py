"""Scale demand by a factor — network-wide, or scoped to one emirate
and/or one service model (R1: an Express-only surge is a different event
from a network-wide one — only Full Hubs can absorb it)."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class DemandScaleScenario(ScenarioModule):
    name = "demand_scale"
    params_schema = {
        "type": "object",
        "properties": {
            "factor": {"type": "number"},
            "emirate": {"type": ["string", "null"]},
            "service_model": {"type": ["string", "null"]},
        },
        "required": ["factor"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        factor = params["factor"]
        emirate = params.get("emirate")

        copy = model.model_copy(deep=True)
        for zone in copy.zones:
            if params.get("service_model") is not None and zone.service_model != params["service_model"]:
                continue
            if emirate is not None and zone.emirate != emirate:
                continue
            zone.demand = round(zone.demand * factor, 4)
            copy.demand[zone.id] = zone.demand
        return copy
