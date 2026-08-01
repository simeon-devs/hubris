"""GET /bottleneck — prescriptive bottleneck unlock (T-23). Thin wrapper
over the `find_bottleneck_unlock` agent tool, so the API and every agent
read the exact same computed recommendation."""

from fastapi import APIRouter, HTTPException

from hubris.agents.tools.find_bottleneck_unlock import FindBottleneckUnlockTool
from hubris.api.state import state

router = APIRouter()


@router.get("/bottleneck")
def get_bottleneck(scenario_id: str | None = None) -> dict:
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc
    return FindBottleneckUnlockTool().run(model=model)
