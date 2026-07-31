"""Greedy hub open/close optimiser (ARCHITECTURE.md §3, module 3c): a
marginal-cost hill-climb over which hubs to keep open, using the min-cost
flow LP (T-08) to score each candidate. Bounded to at most O(hubs^2)
re-solves, each a few milliseconds — this is the guaranteed-to-complete
path the MILP optimiser (T-09's other one) falls back to when it's slow or
infeasible (CLAUDE.md §7: "Every optimiser needs a fallback")."""

from hubris.core.contracts import NetworkModel, OptimizerStrategy, Recommendation
from hubris.core.registry import register_optimizer
from hubris.engine.constraints import max_utilization_constraint
from hubris.engine.flow import FlowResult, solve_min_cost_flow
from hubris.plugins.metrics.cost_to_serve import CostToServeMetric


def _evaluate(
    model: NetworkModel, open_hub_ids: set[str], max_utilization: float
) -> tuple[float, bool, FlowResult]:
    trial_hubs = []
    for hub in model.hubs:
        updates = {"status": "open" if hub.id in open_hub_ids else "closed"}
        if max_utilization < 1.0:
            updates["capacity"] = hub.capacity * max_utilization
        trial_hubs.append(hub.model_copy(update=updates))
    trial = model.model_copy(update={"hubs": trial_hubs})

    flow = solve_min_cost_flow(trial)
    fixed_cost = sum(hub.fixed_cost for hub in trial_hubs if hub.status == "open")
    return flow.total_cost + fixed_cost, flow.feasible, flow


def _greedy_search(model: NetworkModel, max_utilization: float) -> tuple[set[str], float]:
    """Best-improvement hill-climb: each round, close whichever single open
    hub yields the *lowest* resulting cost (not just any improving one —
    the cheapest-fixed-cost hub to drop isn't always the best move once
    rerouting cost is counted), stopping once no closure helps."""
    open_hub_ids = {hub.id for hub in model.hubs if hub.status == "open"}
    best_cost, best_feasible, _ = _evaluate(model, open_hub_ids, max_utilization)
    if not best_feasible:
        return open_hub_ids, best_cost

    improved = True
    while improved:
        improved = False
        if len(open_hub_ids) <= 1:
            break  # never close the last open hub
        best_candidate, best_candidate_cost = None, best_cost
        for hub_id in open_hub_ids:
            candidate = open_hub_ids - {hub_id}
            cost, feasible, _ = _evaluate(model, candidate, max_utilization)
            if feasible and cost < best_candidate_cost:
                best_candidate, best_candidate_cost = candidate, cost
        if best_candidate is not None:
            open_hub_ids, best_cost, improved = best_candidate, best_candidate_cost, True
    return open_hub_ids, best_cost


@register_optimizer
class GreedyOptimizer(OptimizerStrategy):
    name = "greedy"

    def optimize(
        self, model: NetworkModel, objective: dict, constraints: list[dict]
    ) -> Recommendation:
        max_utilization = max_utilization_constraint(constraints)
        open_before = {hub.id for hub in model.hubs if hub.status == "open"}
        open_after, total_cost = _greedy_search(model, max_utilization)

        changes = [{"action": "close_hub", "hub_id": h} for h in sorted(open_before - open_after)]
        changes += [{"action": "open_hub", "hub_id": h} for h in sorted(open_after - open_before)]

        baseline_total_cost = CostToServeMetric().compute(model, None).breakdown["total_cost"]
        delta_pct = (
            (total_cost - baseline_total_cost) / baseline_total_cost * 100
            if baseline_total_cost
            else 0.0
        )

        return Recommendation(
            changes=changes,
            objective_value=round(total_cost, 2),
            delta_vs_baseline={"cost_to_serve_pct": round(delta_pct, 2)},
            rationale={
                "solver": "greedy",
                "hubs_open": sorted(open_after),
                "hubs_open_count": len(open_after),
                "hubs_closed_count": sum(1 for c in changes if c["action"] == "close_hub"),
                "hubs_opened_count": sum(1 for c in changes if c["action"] == "open_hub"),
            },
        )
