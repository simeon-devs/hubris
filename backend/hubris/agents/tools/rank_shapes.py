"""Agent tool: ranked network shapes (engine/ranked_shapes.py) — a bounded
set of candidate configurations, every row actually solved, ranked by cost."""

from hubris.agents.tools.optimise_frontier import OptimiseFrontierTool
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool
from hubris.engine.ranked_shapes import rank_network_shapes


@register_agent_tool
class RankNetworkShapesTool(AgentTool):
    name = "rank_network_shapes"
    description = (
        "Rank candidate network shapes — the current network, every single-hub "
        "close, every candidate-site open, plus the frontier's recommended and "
        "raw optima — each one ACTUALLY evaluated by the engine (reassigned "
        "flow solve, cost metric, five stress re-solves at 0.8x-1.2x demand). "
        "Returns shapes[] with {rank, label, opens, closes, hubs_open, cps "
        "(AED/parcel), aed_day (total AED/day), save_aed_month (vs current — "
        "negative means MORE expensive), stress_safe_pct, feasible, "
        "is_current, is_recommended} — use every figure directly, never "
        "recompute savings or rank yourself. The is_recommended row is the "
        "resilience-constrained optimum; infeasible shapes rank last and say so."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Max shapes returned (default 8)."},
        },
    }

    def run(self, *, model: NetworkModel, limit: int = 8, **_: object) -> dict:
        frontier = OptimiseFrontierTool().run(model=model)
        return rank_network_shapes(
            model,
            limit=limit,
            frontier_constrained_changes=frontier["constrained"]["changes"],
            frontier_raw_changes=frontier["unconstrained"]["changes"],
        )
