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
        "THE tool for 'where do we add capacity, and what does it buy us?' — "
        "including any question about demand that is UNSERVED, unmet, "
        "dropped, or short, and about which facility to expand to fix it. "
        "Turns the network's binding hub-capacity constraints (T-08's flow "
        "duals) into an actionable recommendation, verified by actually "
        "re-solving the flow with the capacity added — never a linear "
        "estimate. Returns bottleneck_found and `kind`:\n"
        "- kind='restore_feasibility' (returned whenever demand is unserved): "
        "`recommendation` has hub_id, unlock_units (capacity to add), "
        "new_capacity, unmet_cleared (units/day of unserved demand this "
        "actually serves), unmet_remaining, served_zone_ids, and "
        "added_transport_cost. NOTE this fix COSTS money — serving parcels "
        "that were being dropped adds transport cost. Never describe it as a "
        "saving; report added_transport_cost as the cost it is.\n"
        "- kind='reduce_cost' (only when all demand is already served): "
        "`recommendation` has hub_id, unlock_units, new_capacity, "
        "verified_cost_savings (AED/period) and unlocked_zone_ids.\n"
        "Also returns `all_candidates` (every facility considered) and a "
        "`why` string you can quote. If bottleneck_found is false, `reason` "
        "explains why — e.g. no open facility can reach the unserved zone "
        "within its promised delivery time, which means a new site is needed "
        "rather than more capacity. Use these values directly; never "
        "re-derive a figure from the duals yourself — duals are only exact "
        "for a single unit and are NOT the reported number."
    )
    input_schema = {"type": "object", "properties": {}}

    def run(self, *, model: NetworkModel, **_: object) -> dict:
        return find_cheapest_bottleneck_unlock(model)
