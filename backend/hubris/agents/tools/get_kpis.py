"""Agent tool: the full KPI dashboard for a network model — one call
instead of one per metric. Returns computed JSON only (CLAUDE.md's one
rule that never moves: agents orchestrate and explain, never invent a
number)."""

from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import METRIC, register_agent_tool
from hubris.core.registry import registry as global_registry


@register_agent_tool
class GetKpisTool(AgentTool):
    name = "get_kpis"
    description = (
        "Compute the full KPI dashboard for a network model: cost-to-serve "
        "(AED/parcel, with transport_cost_pct/fixed_cost_pct shares already "
        "computed — use those directly, never divide transport/fixed by total "
        "yourself), utilization (%, network + per-hub), coverage (% demand "
        "served within SLA), and spare capacity (parcels, network + per-hub). "
        "Every value is computed by the deterministic engine, not estimated."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "scenario_id": {"type": ["string", "null"], "description": "Optional scenario label"}
        },
    }

    def run(self, *, model: NetworkModel, scenario_id: str | None = None, **_: object) -> dict:
        return {
            metric.name: metric.compute(model, scenario_id).model_dump()
            for metric in global_registry.all(METRIC)
        }
