"""Agent tools: T-22's threshold/break-even finder. Two tools, one per
named question — both binary-search the real engine and return computed
JSON only (the search itself, and every number in the result, comes from
real `solve_min_cost_flow` calls, never an LLM estimate)."""

from hubris.agents.threshold_finder import find_customer_count_break, find_demand_growth_break
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool


@register_agent_tool
class FindDemandGrowthBreakTool(AgentTool):
    name = "find_demand_growth_break"
    description = (
        "Answer 'at what demand growth does Hub X break?' by binary-searching "
        "for the smallest demand growth factor (applied only to that hub's "
        "currently-assigned zones) at which the hub's own capacity "
        "constraint first binds in a freshly re-solved flow. Returns "
        "growth_factor_threshold (e.g. 2.0 = demand can double before it "
        "breaks), growth_pct_threshold, hub_utilization_pct and hub_dual at "
        "the threshold, and threshold_found (false if it never breaks within "
        "the search range, or if the hub currently has no assigned demand). "
        "Use these values directly, never estimate a breaking point yourself."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "hub_id": {"type": "string"},
            "max_growth_factor": {"type": "number", "description": "Search ceiling; defaults to 20x"},
        },
        "required": ["hub_id"],
    }

    def run(
        self, *, model: NetworkModel, hub_id: str, max_growth_factor: float = 20.0, **_: object
    ) -> dict:
        return find_demand_growth_break(model, hub_id=hub_id, max_growth_factor=max_growth_factor)


@register_agent_tool
class FindCustomerCountBreakTool(AgentTool):
    name = "find_customer_count_break"
    description = (
        "Answer 'how many customers before SLA fails in <emirate>?' by "
        "adding synthetic representative customers (demand/SLA drawn from "
        "that emirate's own existing zones — never invented) one at a time "
        "until real unmet demand first appears in a freshly re-solved flow. "
        "Returns customer_count_threshold, served_pct_at_threshold (volume-"
        "weighted, computed directly from the flow), unmet_demand_at_threshold, "
        "and representative_customer_profile. Use these directly, never "
        "estimate a breaking point yourself."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "emirate": {"type": "string"},
            "max_customer_count": {"type": "integer", "description": "Search ceiling; defaults to 200"},
        },
        "required": ["emirate"],
    }

    def run(
        self, *, model: NetworkModel, emirate: str, max_customer_count: int = 200, **_: object
    ) -> dict:
        return find_customer_count_break(model, emirate=emirate, max_customer_count=max_customer_count)
