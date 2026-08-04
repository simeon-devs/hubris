"""POST /goal — the goal-driven optimisation loop (T-13, reachable per
T-34). Two ways in, per the graceful-fallback rule:

- `objective` (plain English): the LLM parses intent, the engine searches.
- `targets` (structured): fully LLM-free — the demo path can never hang on
  an API outage, and non-live tests can drive the loop deterministically.

The response is engine JSON only (the LLM never writes prose here), so no
provenance verdict applies — there is nothing to verify that the engine
didn't itself compute."""

from fastapi import APIRouter, HTTPException

from hubris.agents.goal_loop import run_goal_loop
from hubris.api.schemas import GoalRequest, GoalResponse
from hubris.api.state import state

router = APIRouter()


@router.post("/goal", response_model=GoalResponse)
def goal(req: GoalRequest) -> GoalResponse:
    try:
        model = state.get_model(req.scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {req.scenario_id}") from exc

    if req.targets is None and not req.objective:
        raise HTTPException(400, "Provide `objective` (plain English) or `targets` (structured).")

    parser = None
    if req.targets is not None:
        fixed = {
            "target_cost_reduction_pct": req.targets.target_cost_reduction_pct,
            "max_utilization": req.targets.max_utilization,
        }
        parser = lambda _text: fixed  # noqa: E731 — LLM-free path

    try:
        result = run_goal_loop(
            model,
            req.objective or "",
            max_iterations=req.max_iterations,
            parse_objective=parser,
        )
    except Exception as exc:  # noqa: BLE001 — rule 4: LLM/parse failure -> clean 503
        raise HTTPException(
            503, f"Goal loop unavailable: {type(exc).__name__}: {exc}"
        ) from exc
    return GoalResponse(**result)
