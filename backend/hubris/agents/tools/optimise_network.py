"""Agent tool: run the network optimiser (MILP, with its wired-in greedy
fallback) and return the Recommendation as computed JSON."""

from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import OPTIMIZER, register_agent_tool
from hubris.core.registry import registry as global_registry
from hubris.plugins.metrics.cost_to_serve import CostToServeMetric


@register_agent_tool
class OptimiseNetworkTool(AgentTool):
    name = "optimise_network"
    description = (
        "Run the network optimiser to recommend hub open/close changes that "
        "minimise cost, subject to constraints (e.g. "
        "{'type':'max_utilization','value':0.9}). Defaults to the MILP "
        "recommender, which falls back to a greedy heuristic on its own if it "
        "can't solve in time — always returns a result. Returns: changes, "
        "objective_value (total AED), cost_to_serve_before/cost_to_serve_after "
        "(AED/parcel — use these directly, never divide objective_value by a "
        "demand count yourself), cost_to_serve_savings_per_parcel (use "
        "directly, never subtract the two cost_to_serve values yourself), "
        "delta_vs_baseline (% cost-to-serve change), and rationale (includes "
        "hubs_total_count, hubs_open_count, hubs_closed_count — use these "
        "directly, never add/subtract them yourself to get a hub count)."
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
        result = recommendation.model_dump()

        total_demand = sum(model.demand.values())
        cost_to_serve_before = CostToServeMetric().compute(model, None).value
        cost_to_serve_after = (
            round(recommendation.objective_value / total_demand, 4) if total_demand else 0.0
        )
        result["cost_to_serve_before"] = cost_to_serve_before
        result["cost_to_serve_after"] = cost_to_serve_after
        result["cost_to_serve_savings_per_parcel"] = round(
            cost_to_serve_before - cost_to_serve_after, 4
        )
        return result
