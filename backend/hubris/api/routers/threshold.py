"""GET /threshold/demand-growth, GET /threshold/customer-count — T-22's
break-even finder. Thin wrappers over the same two agent tools, so the API
and every agent read the exact same computed threshold."""

from fastapi import APIRouter, HTTPException

from hubris.agents.tools.find_threshold import FindCustomerCountBreakTool, FindDemandGrowthBreakTool
from hubris.api.state import state

router = APIRouter()


@router.get("/threshold/demand-growth")
def demand_growth_threshold(
    hub_id: str, max_growth_factor: float = 20.0, scenario_id: str | None = None
) -> dict:
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc
    try:
        return FindDemandGrowthBreakTool().run(
            model=model, hub_id=hub_id, max_growth_factor=max_growth_factor
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/threshold/customer-count")
def customer_count_threshold(
    emirate: str, max_customer_count: int = 200, scenario_id: str | None = None
) -> dict:
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc
    try:
        return FindCustomerCountBreakTool().run(
            model=model, emirate=emirate, max_customer_count=max_customer_count
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
