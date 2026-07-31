"""Close a hub — flips its status; the flow/optimiser engine already
excludes closed hubs. Reassigning the zones it used to carry is a
re-optimisation, not a structural change, so this deliberately doesn't
touch `assignments` — run the flow/optimizer engine on the result to see
the effect."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.registry import register_scenario


@register_scenario
class CloseHubScenario(ScenarioModule):
    name = "close_hub"
    params_schema = {
        "type": "object",
        "properties": {"hub_id": {"type": "string"}},
        "required": ["hub_id"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        hub = next(h for h in copy.hubs if h.id == params["hub_id"])
        hub.status = "closed"
        return copy
