"""GET /memory/episodes — T-38: the twin's recorded history (every
/simulate and /optimize run, human- or agent-initiated). `available: false`
with an empty list — never an error — when the DB is unreachable, per the
graceful-degradation rule."""

from fastapi import APIRouter

from hubris.memory.store import memory

router = APIRouter()


@router.get("/memory/episodes")
def get_episodes(scenario_name: str | None = None, limit: int = 50) -> dict:
    available = memory.available()
    records = (
        memory.recall("episodic", {"scenario_name": scenario_name} if scenario_name else {}, limit)
        if available
        else []
    )
    return {
        "available": available,
        "episodes": [r.model_dump() for r in records],
        "total_returned": len(records),
    }
