"""POST /optimize — run the network optimiser (T-11's `optimise_network`
tool: MILP with its wired-in greedy fallback) and return the
Recommendation as computed JSON.

POST /optimize/frontier — the realism frontier (Sims, 2026-08-05):
unconstrained optimum vs the resilience-constrained one, side by side,
labelled, with the computed resilience premium. Constraint parameters are
configurable per call (defaults from the assumptions registry) so "what if
we allow two hubs per emirate?" is answerable live."""

from pydantic import BaseModel

from fastapi import APIRouter, HTTPException

from hubris.agents.tools.optimise_frontier import OptimiseFrontierTool
from hubris.agents.tools.optimise_network import OptimiseNetworkTool
from hubris.agents.tools.rank_shapes import RankNetworkShapesTool
from hubris.api.schemas import OptimizeRequest, OptimizeResponse
from hubris.api.state import state
from hubris.memory.apply import apply_heuristics
from hubris.memory.store import memory
from hubris.core.registry import OPTIMIZER
from hubris.core.registry import registry as global_registry

router = APIRouter()


class FrontierRequest(BaseModel):
    scenario_id: str | None = None
    min_hubs_per_emirate: int | None = None   # default: assumptions registry
    max_hub_volume_share: float | None = None  # default: assumptions registry
    objective: dict = {}


@router.post("/optimize", response_model=OptimizeResponse)
def optimize(req: OptimizeRequest) -> OptimizeResponse:
    try:
        model = state.get_model(req.scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {req.scenario_id}") from exc

    known_optimizers = {o.name for o in global_registry.all(OPTIMIZER)}
    if req.optimizer_name not in known_optimizers:
        raise HTTPException(400, f"Unknown optimizer_name: {req.optimizer_name!r}")

    result = OptimiseNetworkTool().run(
        model=model,
        objective=req.objective,
        constraints=req.constraints,
        optimizer_name=req.optimizer_name,
        demand_variation_pct=req.demand_variation_pct,
    )

    # T-38: every optimiser run becomes an episode (graceful, best-effort).
    memory.record_episode(
        scenario_name="optimise_network",
        params={
            "objective": req.objective,
            "constraints": req.constraints,
            "optimizer_name": req.optimizer_name,
            "demand_variation_pct": req.demand_variation_pct,
        },
        kpis={
            "cost_to_serve_before": result["cost_to_serve_before"],
            "cost_to_serve_after": result["cost_to_serve_after"],
            "total_cost_savings": result["total_cost_savings"],
        },
        outcome={
            "changes": result["changes"],
            "objective_value": result["objective_value"],
            "holds_under_variation": result["robustness"]["holds_under_variation"],
        },
        scenario_id=req.scenario_id,
        source="api:/optimize",
    )
    result = apply_heuristics("optimise_network", result)  # T-39
    return OptimizeResponse(**result)


@router.post("/optimize/frontier")
def optimize_frontier(req: FrontierRequest) -> dict:
    try:
        model = state.get_model(req.scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {req.scenario_id}") from exc

    result = OptimiseFrontierTool().run(
        model=model,
        min_hubs_per_emirate=req.min_hubs_per_emirate,
        max_hub_volume_share=req.max_hub_volume_share,
        objective=req.objective or None,
    )

    # T-38: the frontier run is an episode too (graceful, best-effort).
    memory.record_episode(
        scenario_name="optimise_frontier",
        params=result["params"],
        kpis={
            "baseline_cost_to_serve": result["baseline"]["cost_to_serve"],
            "unconstrained_delta_pct": result["unconstrained"]["delta_vs_baseline_pct"],
            "constrained_delta_pct": result["constrained"]["delta_vs_baseline_pct"],
        },
        outcome={
            "constrained_changes": result["constrained"]["changes"],
            "resilience_premium": result["resilience_premium"],
        },
        scenario_id=req.scenario_id,
        source="api:/optimize/frontier",
    )
    return result


@router.get("/optimize/ranked-shapes")
def ranked_shapes(scenario_id: str | None = None, limit: int = 8) -> dict:
    """Ranked network shapes — every row a real engine evaluation (see
    engine/ranked_shapes.py). The is_recommended row is the frontier's
    resilience-constrained optimum."""
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc
    return RankNetworkShapesTool().run(model=model, limit=limit)
