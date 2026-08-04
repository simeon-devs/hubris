"""Scale demand by a factor — network-wide, or scoped to one emirate."""

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
        },
        "required": ["factor"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        factor = params["factor"]
        emirate = params.get("emirate")

        copy = model.model_copy(deep=True, update={"flow_volumes": None})  # structure changed - stale flow split must not survive
        for zone in copy.zones:
            if emirate is not None and zone.emirate != emirate:
                continue
            zone.demand = round(zone.demand * factor, 4)
            copy.demand[zone.id] = zone.demand
        return copy
