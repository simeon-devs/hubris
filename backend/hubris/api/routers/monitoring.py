"""T-40's control surface: the watchdog's status, pause switch, manual
trigger, and the alert feed with acknowledge — everything reachable
through the API even before the UI exists (Sims' Wave-3 rule)."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hubris.api.state import state
from hubris.memory.store import memory
from hubris.monitoring import scheduler

router = APIRouter()


@router.get("/monitoring/status")
def monitoring_status() -> dict:
    return scheduler.status


class EnabledRequest(BaseModel):
    enabled: bool


@router.post("/monitoring/enabled")
def set_enabled(req: EnabledRequest) -> dict:
    scheduler.status["enabled"] = req.enabled
    return {"enabled": req.enabled}


class RunOnceRequest(BaseModel):
    # Optional override so a demo (or test) can crank the stress live
    # instead of waiting for organic load.
    stress_factor: float | None = None


@router.post("/monitoring/run-once")
def run_once(req: RunOnceRequest) -> dict:
    return scheduler._sweep_once(state, stress_factor=req.stress_factor)


@router.get("/memory/alerts")
def get_alerts(include_acknowledged: bool = False, limit: int = 50) -> dict:
    available = memory.available()
    alerts = memory.list_alerts(include_acknowledged, limit) if available else []
    return {"available": available, "alerts": alerts, "total_returned": len(alerts)}


@router.post("/memory/alerts/{alert_id}/ack")
def acknowledge(alert_id: str) -> dict:
    if not memory.available():
        raise HTTPException(503, "memory unavailable")
    if not memory.acknowledge_alert(alert_id):
        raise HTTPException(404, f"Unknown alert: {alert_id}")
    return {"id": alert_id, "acknowledged": True}
