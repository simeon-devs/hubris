"""The learning twin's read/curate surface.

GET /memory/episodes (T-38) — every /simulate and /optimize run, human- or
agent-initiated. GET /memory/facts + /memory/heuristics (T-39) — what the
engine has learned and what agents have written. POST
/memory/heuristics/{name}/active (T-39) — the planner's retire switch:
a heuristic can be switched off (kept, auditable) without deleting it.
All reads return `available: false` with empty lists — never an error —
when the DB is unreachable."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


@router.get("/memory/facts")
def get_facts(key_prefix: str | None = None, limit: int = 50) -> dict:
    available = memory.available()
    records = (
        memory.recall("semantic", {"key_prefix": key_prefix} if key_prefix else {}, limit)
        if available
        else []
    )
    return {
        "available": available,
        "facts": [r.model_dump() for r in records],
        "total_returned": len(records),
    }


@router.get("/memory/heuristics")
def get_heuristics(include_retired: bool = True, limit: int = 50) -> dict:
    available = memory.available()
    records = (
        memory.recall("procedural", {"active_only": not include_retired}, limit)
        if available
        else []
    )
    return {
        "available": available,
        "heuristics": [r.model_dump() for r in records],
        "total_returned": len(records),
    }


class HeuristicActiveRequest(BaseModel):
    active: bool


@router.post("/memory/heuristics/{name}/active")
def set_heuristic_active(name: str, req: HeuristicActiveRequest) -> dict:
    if not memory.available():
        raise HTTPException(503, "memory unavailable")
    if not memory.set_heuristic_active(name, req.active):
        raise HTTPException(404, f"Unknown heuristic: {name}")
    return {"name": name, "active": req.active}
