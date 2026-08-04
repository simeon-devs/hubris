"""Auto decision-brief (T-24; BUILD_SPEC §5): a one-page leadership brief —
current state, proposed change, cost/risk, what it unblocks, sensitivity —
composed entirely from OTHER tools' already-computed JSON: T-09's optimiser
(+ its T-20 robustness band) and T-23's bottleneck unlock. No new numeric
computation happens here; this is pure orchestration plus a plain-Python-
templated summary paragraph, so the brief is always available (no LLM or
network dependency, never hangs) and every number in it traces to a
specific upstream tool call — the same guarantee as everywhere else."""

from datetime import datetime, timezone

from hubris.agents.tools.find_bottleneck_unlock import FindBottleneckUnlockTool
from hubris.agents.tools.get_kpis import GetKpisTool
from hubris.agents.tools.optimise_network import OptimiseNetworkTool
from hubris.core.contracts import NetworkModel


def generate_decision_brief(
    model: NetworkModel,
    optimizer_name: str = "milp_cflp",
    objective: dict | None = None,
    constraints: list[dict] | None = None,
    demand_variation_pct: float = 20.0,
) -> dict:
    kpis = GetKpisTool().run(model=model)
    optimize_result = OptimiseNetworkTool().run(
        model=model,
        objective=objective or {},
        constraints=constraints or [],
        optimizer_name=optimizer_name,
        demand_variation_pct=demand_variation_pct,
    )
    bottleneck = FindBottleneckUnlockTool().run(model=model)

    current_state = {
        "baseline_provenance": kpis["network_summary"]["baseline_provenance"],  # T-31
        "cost_to_serve": kpis["cost_to_serve"]["value"],
        "utilization_pct": kpis["utilization"]["value"],
        "coverage_pct": kpis["coverage"]["value"],
        "spare_capacity": kpis["spare_capacity"]["value"],
        "network_summary": kpis["network_summary"],
    }
    proposed_change = {
        "changes": optimize_result["changes"],
        "objective_value": optimize_result["objective_value"],
        "rationale": optimize_result["rationale"],
    }
    cost_risk = {
        "cost_to_serve_before": optimize_result["cost_to_serve_before"],
        "cost_to_serve_after": optimize_result["cost_to_serve_after"],
        "cost_to_serve_savings_per_parcel": optimize_result["cost_to_serve_savings_per_parcel"],
        "delta_vs_baseline": optimize_result["delta_vs_baseline"],
    }
    sensitivity = optimize_result["robustness"]
    what_it_unblocks = bottleneck if bottleneck["bottleneck_found"] else None

    caveat = _baseline_caveat(current_state["baseline_provenance"])
    summary = _write_summary(proposed_change, cost_risk, sensitivity, what_it_unblocks)
    if caveat:
        summary = f"{summary} {caveat}"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": summary,
        "current_state": current_state,
        "proposed_change": proposed_change,
        "cost_risk": cost_risk,
        "sensitivity": sensitivity,
        "what_it_unblocks": what_it_unblocks,
    }


def _write_summary(proposed_change: dict, cost_risk: dict, sensitivity: dict, what_it_unblocks: dict | None) -> str:
    changes = proposed_change["changes"]
    if not changes:
        change_sentence = "The current network configuration is already optimal — no hub changes recommended."
    else:
        actions = "; ".join(f"{c['action'].replace('_', ' ')} {c['hub_id']}" for c in changes)
        change_sentence = f"Recommended change: {actions}."

    cost_pct = cost_risk["delta_vs_baseline"].get("cost_to_serve_pct", 0)
    savings_sentence = (
        f"Cost-to-serve moves from {cost_risk['cost_to_serve_before']} to "
        f"{cost_risk['cost_to_serve_after']} AED/parcel ({cost_pct}%), saving "
        f"{cost_risk['cost_to_serve_savings_per_parcel']} AED/parcel."
    )

    robustness_sentence = (
        f"Under +/-{sensitivity['demand_variation_pct']}% demand variation across "
        f"{sensitivity['trials']} Monte Carlo trials, cost-to-serve holds between "
        f"{sensitivity['cost_to_serve_p10']} and {sensitivity['cost_to_serve_p90']} AED/parcel, "
        f"remaining feasible in {sensitivity['feasible_pct']}% of trials "
        f"({'robust' if sensitivity['holds_under_variation'] else 'AT RISK'} under this range)."
    )

    unblock_sentence = (
        what_it_unblocks["why"]
        if what_it_unblocks
        else "No hub capacity constraint is currently binding, so there is no bottleneck to unlock."
    )

    return " ".join([change_sentence, savings_sentence, robustness_sentence, unblock_sentence])


def _baseline_caveat(provenance: str) -> str | None:
    """T-31: the sentence the brief must carry whenever the improvement is
    measured against our own proxy. None when real assignments were
    ingested — no scary caveat where none is due."""
    if provenance != "provided":
        return (
            "Baseline note: the current assignment is a RECONSTRUCTED nearest-hub proxy, "
            "not EMX's recorded practice — improvement figures are measured against that "
            "reconstruction and must be re-validated once real assignment data is loaded."
        )
    return None
