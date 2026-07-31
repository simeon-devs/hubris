"""GET /kpis — the KPI dashboard for the current baseline or a named
scenario. Thin wrapper over T-11's `get_kpis` agent tool, so the API and
every agent read the exact same computed numbers."""

from fastapi import APIRouter, HTTPException

from hubris.agents.tools.get_kpis import GetKpisTool
from hubris.api.state import state

router = APIRouter()


@router.get("/kpis")
def get_kpis(scenario_id: str | None = None) -> dict:
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc
    return GetKpisTool().run(model=model)
