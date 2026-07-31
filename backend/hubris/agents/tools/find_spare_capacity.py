"""Agent tool: which hub(s) have spare capacity? Wraps the spare_capacity
metric and ranks hubs so the agent can answer "which hub can absorb more
demand?" directly from a computed number, never a guess."""

from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool
from hubris.plugins.metrics.spare_capacity import SpareCapacityMetric


@register_agent_tool
class FindSpareCapacityTool(AgentTool):
    name = "find_spare_capacity"
    description = (
        "Find hubs with spare capacity, ranked from most to least spare "
        "(parcels). Use this to answer 'which hub can absorb more demand?' or "
        "'is there room for a new customer at Hub X?'."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "min_spare": {
                "type": "number",
                "description": "Only include hubs with at least this much spare capacity",
            }
        },
    }

    def run(self, *, model: NetworkModel, min_spare: float = 0.0, **_: object) -> dict:
        result = SpareCapacityMetric().compute(model, None)
        ranked = sorted(result.breakdown.items(), key=lambda kv: kv[1], reverse=True)
        return {
            "total_spare_capacity": result.value,
            "unit": result.unit,
            "hubs_ranked": [
                {"hub_id": hub_id, "spare_capacity": spare}
                for hub_id, spare in ranked
                if spare >= min_spare
            ],
        }
