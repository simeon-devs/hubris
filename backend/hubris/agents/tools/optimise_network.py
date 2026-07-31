"""Agent tool: run the network optimiser (MILP, with its wired-in greedy
fallback) and return the Recommendation as computed JSON."""

from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import OPTIMIZER, register_agent_tool
from hubris.core.registry import registry as global_registry


@register_agent_tool
class OptimiseNetworkTool(AgentTool):
    name = "optimise_network"
    description = (
        "Run the network optimiser to recommend hub open/close changes that "
        "minimise cost, subject to constraints (e.g. "
        "{'type':'max_utilization','value':0.9}). Defaults to the MILP "
        "recommender, which falls back to a greedy heuristic on its own if it "
        "can't solve in time — always returns a result. Returns: changes, "
        "objective_value (AED), delta_vs_baseline (% cost-to-serve change), "
        "and rationale."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "objective": {"type": "object"},
            "constraints": {"type": "array"},
            "optimizer_name": {"type": "string"},
        },
    }

    def run(
        self,
        *,
        model: NetworkModel,
        objective: dict | None = None,
        constraints: list[dict] | None = None,
        optimizer_name: str = "milp_cflp",
        **_: object,
    ) -> dict:
        optimizer = global_registry.get(OPTIMIZER, optimizer_name)
        recommendation = optimizer.optimize(model, objective or {}, constraints or [])
        return recommendation.model_dump()
