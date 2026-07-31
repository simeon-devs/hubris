"""GET /scenarios — every registered `ScenarioModule`'s name + params
schema, so the frontend's scenario panel (T-17) can build its controls
without hard-coding what fields each scenario needs."""

from fastapi import APIRouter

from hubris.api.schemas import ScenarioModuleInfo
from hubris.core.registry import SCENARIO
from hubris.core.registry import registry as global_registry

router = APIRouter()


@router.get("/scenarios", response_model=list[ScenarioModuleInfo])
def list_scenarios() -> list[ScenarioModuleInfo]:
    return [
        ScenarioModuleInfo(name=s.name, params_schema=s.params_schema)
        for s in global_registry.all(SCENARIO)
    ]
