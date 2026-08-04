"""MILP CFLP recommender (ARCHITECTURE.md §3, module 3c; BUILD_SPEC §3-4):
binary hub open/close `y_j` chosen jointly with continuous zone->hub flow
`x_ij`, solved with PuLP+CBC under a strict time limit. Falls back to the
greedy optimiser — wired in from the start, not bolted on later — the
moment CBC fails to reach an optimal solution in time, so a recommendation
always comes back (CLAUDE.md §7: "the demo never hangs")."""

import pulp

from hubris.core import assumptions
from hubris.core.contracts import NetworkModel, OptimizerStrategy, Recommendation
from hubris.core.registry import register_optimizer
from hubris.engine.constraints import max_utilization_constraint
from hubris.plugins.metrics.cost_to_serve import CostToServeMetric
from hubris.plugins.optimizers.greedy import GreedyOptimizer

DEFAULT_TIME_LIMIT_SECONDS = assumptions.value("milp_time_limit_seconds")  # T-32


@register_optimizer
class MILPOptimizer(OptimizerStrategy):
    name = "milp_cflp"

    def __init__(self, time_limit_seconds: float = DEFAULT_TIME_LIMIT_SECONDS):
        self._time_limit_seconds = time_limit_seconds

    def optimize(
        self, model: NetworkModel, objective: dict, constraints: list[dict]
    ) -> Recommendation:
        try:
            recommendation = self._solve_milp(model, objective, constraints)
            recommendation.rationale["solver"] = "milp_cflp"
            return recommendation
        except Exception as exc:
            fallback = GreedyOptimizer().optimize(model, objective, constraints)
            fallback.rationale["solver"] = "greedy"
            fallback.rationale["fallback_reason"] = f"MILP failed: {exc}"
            return fallback

    def _solve_milp(
        self, model: NetworkModel, objective: dict, constraints: list[dict]
    ) -> Recommendation:
        max_utilization = max_utilization_constraint(constraints)

        edges = []
        for hub in model.hubs:
            for zone in model.zones:
                od = model.od_matrix.get((hub.id, zone.id))
                if od is None or od.time_min > zone.sla_hours * 60:
                    continue
                edges.append((hub.id, zone.id))

        prob = pulp.LpProblem("cflp", pulp.LpMinimize)
        open_var = {hub.id: pulp.LpVariable(f"open_{hub.id}", cat="Binary") for hub in model.hubs}
        flow_var = {edge: pulp.LpVariable(f"x_{edge[0]}_{edge[1]}", lowBound=0) for edge in edges}

        cost_by_edge = {edge: model.od_matrix[edge].cost for edge in edges}
        fixed_by_hub = {hub.id: hub.fixed_cost for hub in model.hubs}

        prob += pulp.lpSum(fixed_by_hub[h] * open_var[h] for h in open_var) + pulp.lpSum(
            cost_by_edge[e] * flow_var[e] for e in edges
        )

        for zone in model.zones:
            zone_edges = [e for e in edges if e[1] == zone.id]
            prob += pulp.lpSum(flow_var[e] for e in zone_edges) == zone.demand, f"demand_{zone.id}"

        for hub in model.hubs:
            hub_edges = [e for e in edges if e[0] == hub.id]
            capacity = hub.capacity * max_utilization
            prob += (
                pulp.lpSum(flow_var[e] for e in hub_edges) <= capacity * open_var[hub.id],
                f"capacity_{hub.id}",
            )

        solver = pulp.PULP_CBC_CMD(msg=False, timeLimit=self._time_limit_seconds)
        status = prob.solve(solver)

        if pulp.LpStatus[status] != "Optimal":
            raise RuntimeError(f"solver status: {pulp.LpStatus[status]}")

        open_hub_ids = {h for h, var in open_var.items() if (var.value() or 0.0) > 0.5}
        transport_cost = sum(cost_by_edge[e] * (flow_var[e].value() or 0.0) for e in edges)
        fixed_cost = sum(fixed_by_hub[h] for h in open_hub_ids)
        total_cost = transport_cost + fixed_cost

        original_open = {hub.id for hub in model.hubs if hub.status == "open"}
        changes = [
            {"action": "close_hub", "hub_id": h} for h in sorted(original_open - open_hub_ids)
        ]
        changes += [
            {"action": "open_hub", "hub_id": h} for h in sorted(open_hub_ids - original_open)
        ]

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
                "hubs_open": sorted(open_hub_ids),
                "hubs_open_count": len(open_hub_ids),
                "hubs_total_count": len(model.hubs),
                "hubs_closed_count": sum(1 for c in changes if c["action"] == "close_hub"),
                "hubs_opened_count": sum(1 for c in changes if c["action"] == "open_hub"),
                "solver_status": pulp.LpStatus[status],
            },
        )
