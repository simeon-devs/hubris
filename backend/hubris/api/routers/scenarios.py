"""GET /scenarios — every registered `ScenarioModule`'s name + params
schema, so the frontend's scenario panel (T-17) can build its controls
without hard-coding what fields each scenario needs.

GET /scenarios/saved — the named scenario INSTANCES currently held in
state (those created via `/simulate?save_as=` plus T-30's seeded demo
scenario), so the frontend can offer a picker that switches every view
onto a saved scenario."""

from fastapi import APIRouter, HTTPException

from hubris.api.schemas import SavedScenarioInfo, ScenarioModuleInfo
from hubris.api.state import state
from hubris.core.registry import SCENARIO
from hubris.core.registry import registry as global_registry

router = APIRouter()

# The seeded demo twin (T-30, Sims-approved): deleting it would kill the
# crisis demo until the next boot — refuse instead of silently obeying.
PROTECTED_SCENARIO_IDS = {"qcomm_twin"}


@router.get("/scenarios", response_model=list[ScenarioModuleInfo])
def list_scenarios() -> list[ScenarioModuleInfo]:
    return [
        ScenarioModuleInfo(name=s.name, params_schema=s.params_schema)
        for s in global_registry.all(SCENARIO)
    ]


@router.get("/scenarios/saved", response_model=list[SavedScenarioInfo])
def list_saved_scenarios() -> list[SavedScenarioInfo]:
    return [
        SavedScenarioInfo(id=scenario_id, label=state.scenario_labels.get(scenario_id, scenario_id))
        for scenario_id in state.scenarios
    ]


@router.delete("/scenarios/saved/{scenario_id}", status_code=204)
def delete_saved_scenario(scenario_id: str) -> None:
    """Remove a saved what-if so the scenario chip rail stays curated
    (ported from hubris-main). The seeded demo twin is protected."""
    if scenario_id in PROTECTED_SCENARIO_IDS:
        raise HTTPException(
            409,
            f"'{scenario_id}' is the seeded demo twin and cannot be deleted; "
            "restart the backend to re-seed state instead.",
        )
    if scenario_id not in state.scenarios:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}")
    del state.scenarios[scenario_id]
    state.scenario_labels.pop(scenario_id, None)
