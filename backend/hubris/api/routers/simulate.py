"""POST /simulate — apply a named what-if scenario and return KPIs +
delta vs baseline (T-11's `simulate_scenario` tool). `save_as` optionally
persists the resulting model as a named scenario other endpoints can
reference via `scenario_id` — baseline and scenario coexist (T-10)."""

from fastapi import APIRouter, HTTPException

from hubris.agents.scenario_utils import apply_and_reassign
from hubris.agents.tools.simulate_scenario import SimulateScenarioTool
from hubris.api.schemas import SimulateRequest, SimulateResponse
from hubris.api.state import state
from hubris.memory.apply import apply_heuristics
from hubris.memory.store import memory
from hubris.core.registry import SCENARIO
from hubris.core.registry import registry as global_registry

router = APIRouter()


@router.post("/simulate", response_model=SimulateResponse)
def simulate(req: SimulateRequest) -> SimulateResponse:
    try:
        base_model = state.get_model(req.base_scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {req.base_scenario_id}") from exc

    known_scenarios = {s.name for s in global_registry.all(SCENARIO)}
    if req.scenario_name not in known_scenarios:
        raise HTTPException(400, f"Unknown scenario_name: {req.scenario_name!r}")

    try:
        result = SimulateScenarioTool().run(
            model=base_model, scenario_name=req.scenario_name, params=req.params
        )
    except (KeyError, StopIteration) as exc:
        raise HTTPException(400, f"Invalid params for {req.scenario_name!r}: {exc}") from exc

    scenario_id = None
    if req.save_as:
        reassigned_model, _ = apply_and_reassign(base_model, req.scenario_name, req.params)
        state.save_scenario(
            req.save_as, reassigned_model, label=f"{req.save_as} ({req.scenario_name})"
        )
        scenario_id = req.save_as

    # T-38: every simulate run becomes an episode — best-effort, graceful
    # (an unreachable DB must never fail the simulation itself).
    memory.record_episode(
        scenario_name=req.scenario_name,
        params=req.params,
        kpis=result["scenario_kpis"],
        outcome={
            "feasible": result["scenario_flow_feasible"],
            "delta_pct": result["delta_pct"],
            "saved_as": scenario_id,
        },
        scenario_id=req.base_scenario_id,
        source="api:/simulate",
    )

    result = apply_heuristics("simulate_scenario", result)  # T-39
    return SimulateResponse(**result, scenario_id=scenario_id)
