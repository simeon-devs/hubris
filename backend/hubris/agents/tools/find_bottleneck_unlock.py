"""Agent tool: T-23's prescriptive bottleneck unlock. Wraps
`hubris.engine.bottleneck.find_cheapest_bottleneck_unlock` — returns
computed JSON only, including a pre-built `why` string so the agent never
has to phrase the recommendation's justification itself."""

from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool
from hubris.engine.bottleneck import find_cheapest_bottleneck_unlock


@register_agent_tool
class FindBottleneckUnlockTool(AgentTool):
    name = "find_bottleneck_unlock"
    description = (
        "Turn the network's binding hub-capacity constraints (T-08's flow "
        "duals) into an actionable recommendation: the cheapest way to "
        "unlock cost savings by adding capacity. Returns bottleneck_found; "
        "if true, `recommendation` (hub_id, unlock_units — how much capacity "
        "to add, new_capacity, verified_cost_savings — AED/period, confirmed "
        "by actually re-solving the flow with that capacity added, never a "
        "linear estimate — and unlocked_zone_ids), `all_candidates` (every "
        "binding hub considered), and a `why` string. Use these values "
        "directly, never re-derive a savings figure from the duals yourself "
        "— duals are only exact for a single unit and are NOT the reported "
        "savings number."
    )
    input_schema = {"type": "object", "properties": {}}

    def run(self, *, model: NetworkModel, **_: object) -> dict:
        return find_cheapest_bottleneck_unlock(model)
