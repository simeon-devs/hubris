"""Agent tool: the realism FRONTIER (Sims decision, 2026-08-05).

The unconstrained MILP optimum on the real network consolidates 8 of 10
hubs — mathematically optimal, operationally indefensible. This tool runs
the optimiser TWICE — unconstrained, then under configurable resilience
constraints (min open hubs per emirate, max single-hub volume share) — and
returns both results side by side, labelled, plus the computed resilience
premium. The deliverable number is the constrained one; the unconstrained
one is reported, never recommended.

Constraints are enforced by the MILP itself; if the solver falls back to
greedy (which cannot enforce them), that side is honestly marked
`constraints_enforced: false` rather than silently mislabelled.
"""

from hubris.core import assumptions
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import OPTIMIZER, register_agent_tool
from hubris.core.registry import registry as global_registry
from hubris.engine.monte_carlo import apply_recommendation_changes
from hubris.plugins.metrics.cost_to_serve import CostToServeMetric

DEFAULT_MIN_HUBS_PER_EMIRATE = assumptions.value("frontier_min_hubs_per_emirate")
DEFAULT_MAX_HUB_VOLUME_SHARE = assumptions.value("frontier_max_hub_volume_share")
VARIABLE_COST_TARGET_AED = assumptions.value("dataset_g_variable_cost_target_aed")


def _cost_pools(metric_result) -> dict:
    """Both labelled pools from one cost_to_serve computation (Sims,
    2026-08-05): their ≤7.00 target is defined on the VARIABLE pool, and
    consolidation moves the two pools in opposite directions — so every
    frontier point reports both, never a blended single number.
    Variable = transport+handling per parcel; fully-loaded adds fixed."""
    b = metric_result.breakdown
    demand = b["total_demand"]
    variable = round(b["transport_cost"] / demand, 4) if demand else 0.0
    return {
        "variable_only_aed_per_parcel": variable,
        "fully_loaded_aed_per_parcel": metric_result.value,
        "variable_target_aed": VARIABLE_COST_TARGET_AED,
        "variable_vs_target_aed": round(variable - VARIABLE_COST_TARGET_AED, 4),
        "meets_variable_target": variable <= VARIABLE_COST_TARGET_AED,
    }


@register_agent_tool
class OptimiseFrontierTool(AgentTool):
    name = "optimise_frontier"
    description = (
        "Run the network optimiser twice and return the realism FRONTIER: "
        "the unconstrained optimum (reported, never recommended — it "
        "concentrates the network) side by side with the constrained optimum "
        "under resilience rules (at least min_hubs_per_emirate open hubs in "
        "every emirate with a facility, no hub carrying more than "
        "max_hub_volume_share of network volume). Both parameters are "
        "optional and default from the assumptions registry. Returns: "
        "baseline {cost_to_serve, total_cost, cost_pools, hubs_open_count}; "
        "unconstrained and constrained, each with {objective_value (total "
        "AED/period), delta_vs_baseline_pct, cost_to_serve_after (AED/"
        "parcel), cost_pools, changes, hubs_open, volume_share_by_hub, "
        "constraints_enforced}; and resilience_premium {total_cost_delta "
        "(AED/period the constrained optimum gives up vs unconstrained), "
        "pct_points_of_saving_given_up}. Each cost_pools block carries BOTH "
        "labelled pools — variable_only_aed_per_parcel (the pool the ≤7.00 "
        "AED target is defined on, with variable_vs_target_aed and "
        "meets_variable_target precomputed) and fully_loaded_aed_per_parcel "
        "— quote them separately by name, NEVER blend them or present one "
        "as the other; consolidation moves them in opposite directions. Use "
        "every figure directly, never recompute deltas, shares, or target "
        "gaps yourself. The recommendation to present is ALWAYS the "
        "constrained one."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "min_hubs_per_emirate": {
                "type": "integer",
                "description": "Resilience floor per emirate (default from registry: 1).",
            },
            "max_hub_volume_share": {
                "type": "number",
                "description": "Max fraction of network volume on one hub, 0-1 (default from registry: 0.40).",
            },
            "objective": {"type": "object"},
        },
    }

    def run(
        self,
        *,
        model: NetworkModel,
        min_hubs_per_emirate: int | None = None,
        max_hub_volume_share: float | None = None,
        objective: dict | None = None,
    ) -> dict:
        floor = int(
            DEFAULT_MIN_HUBS_PER_EMIRATE if min_hubs_per_emirate is None else min_hubs_per_emirate
        )
        share = float(
            DEFAULT_MAX_HUB_VOLUME_SHARE if max_hub_volume_share is None else max_hub_volume_share
        )
        objective = objective or {"name": "cost_to_serve"}
        realism = [
            {"type": "min_hubs_per_emirate", "value": floor},
            {"type": "max_hub_volume_share", "value": share},
        ]

        # Constraints are MILP-enforced; greedy fallback cannot honour them,
        # so each side reports whether enforcement actually happened.
        optimizer = global_registry.get(OPTIMIZER, "milp_cflp")
        metric = CostToServeMetric()
        baseline_metric = metric.compute(model, None)

        sides = {}
        for label, constraints in (("unconstrained", []), ("constrained", realism)):
            rec = optimizer.optimize(model, objective, constraints)
            after_model = apply_recommendation_changes(model, rec.changes)
            after_metric = metric.compute(after_model, None)
            sides[label] = {
                "objective_value": rec.objective_value,
                "delta_vs_baseline_pct": rec.delta_vs_baseline.get("cost_to_serve_pct"),
                "cost_to_serve_after": after_metric.value,
                "cost_pools": _cost_pools(after_metric),
                "changes": rec.changes,
                "hubs_open": rec.rationale.get("hubs_open", []),
                "hubs_open_count": rec.rationale.get("hubs_open_count"),
                "volume_share_by_hub": rec.rationale.get("volume_share_by_hub", {}),
                "constraints_enforced": rec.rationale.get("solver") == "milp_cflp",
                "constraints_used": constraints,
                "solver": rec.rationale.get("solver"),
            }

        premium_total = round(
            sides["constrained"]["objective_value"] - sides["unconstrained"]["objective_value"], 2
        )
        premium_pct_points = None
        if (
            sides["constrained"]["delta_vs_baseline_pct"] is not None
            and sides["unconstrained"]["delta_vs_baseline_pct"] is not None
        ):
            premium_pct_points = round(
                sides["constrained"]["delta_vs_baseline_pct"]
                - sides["unconstrained"]["delta_vs_baseline_pct"],
                2,
            )

        return {
            "baseline": {
                "cost_to_serve": baseline_metric.value,
                "total_cost": baseline_metric.breakdown["total_cost"],
                "cost_pools": _cost_pools(baseline_metric),
                "hubs_open_count": sum(1 for h in model.hubs if h.status == "open"),
            },
            "unconstrained": sides["unconstrained"],
            "constrained": sides["constrained"],
            "resilience_premium": {
                "total_cost_delta": premium_total,
                "pct_points_of_saving_given_up": premium_pct_points,
            },
            "params": {
                "min_hubs_per_emirate": floor,
                "max_hub_volume_share": share,
                "defaults_source": "assumptions registry (overridable per call)",
            },
            "recommendation_policy": (
                "present the CONSTRAINED optimum; the unconstrained figure is "
                "reported for transparency, not recommended"
            ),
        }
