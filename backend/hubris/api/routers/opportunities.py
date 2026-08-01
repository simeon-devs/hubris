"""GET /opportunities — proactive inefficiency scan (T-21). Thin wrapper
over the `scan_opportunities` agent tool, so the API and every agent read
the exact same computed findings."""

from fastapi import APIRouter, HTTPException

from hubris.agents.tools.scan_opportunities import ScanOpportunitiesTool
from hubris.api.state import state

router = APIRouter()


@router.get("/opportunities")
def get_opportunities(scenario_id: str | None = None) -> dict:
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc
    return ScanOpportunitiesTool().run(model=model)
