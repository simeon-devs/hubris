"""GET /brief — auto decision-brief (T-24). Thin wrapper over the
`generate_decision_brief` agent tool, so the API and every agent read the
exact same computed brief."""

from fastapi import APIRouter, HTTPException

from hubris.agents.tools.generate_brief import GenerateDecisionBriefTool
from hubris.api.state import state

router = APIRouter()


@router.get("/brief")
def get_brief(
    optimizer_name: str = "milp_cflp",
    demand_variation_pct: float = 20.0,
    scenario_id: str | None = None,
) -> dict:
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc
    return GenerateDecisionBriefTool().run(
        model=model, optimizer_name=optimizer_name, demand_variation_pct=demand_variation_pct
    )
