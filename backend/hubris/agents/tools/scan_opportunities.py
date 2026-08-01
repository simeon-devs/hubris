"""Agent tool: proactively scan for network inefficiencies nobody asked
about (T-21). Wraps `hubris.engine.opportunities.scan_opportunities` —
returns computed JSON only, including a pre-built `why` string per finding
so the agent never has to phrase a numeric justification itself."""

from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool
from hubris.engine.opportunities import scan_opportunities


@register_agent_tool
class ScanOpportunitiesTool(AgentTool):
    name = "scan_opportunities"
    description = (
        "Proactively scan the network for inefficiencies, unprompted — use "
        "this when asked for opportunities, inefficiencies, or 'anything we "
        "should fix' without a specific target in mind. Returns three "
        "inefficiency types, each with a computed figure and a `why` string "
        "already built from that figure (use the why/figures directly, "
        "never re-derive them): overlapping_coverage (hub pairs whose "
        "cost-competitive catchments overlap — consolidation candidates), "
        "far_hub_service (zones paying an avoidable premium because their "
        "CURRENT assignment isn't their cheapest available hub), and "
        "idle_next_to_overload (a hub running hot relative to the network's "
        "own average utilization next to a nearby hub sitting idle). Also "
        "returns total_opportunities and inefficiency_types_found."
    )
    input_schema = {"type": "object", "properties": {}}

    def run(self, *, model: NetworkModel, **_: object) -> dict:
        return scan_opportunities(model)
