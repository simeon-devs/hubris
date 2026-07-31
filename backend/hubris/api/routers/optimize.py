"""POST /optimize — run the network optimiser (T-11's `optimise_network`
tool: MILP with its wired-in greedy fallback) and return the
Recommendation as computed JSON."""

from fastapi import APIRouter, HTTPException

from hubris.agents.tools.optimise_network import OptimiseNetworkTool
from hubris.api.schemas import OptimizeRequest, OptimizeResponse
from hubris.api.state import state
from hubris.core.registry import OPTIMIZER
from hubris.core.registry import registry as global_registry

router = APIRouter()


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
    )
    return OptimizeResponse(**result)
