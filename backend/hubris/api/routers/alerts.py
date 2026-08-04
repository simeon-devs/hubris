"""GET /alerts — what the monitoring agents (autonomy="monitoring" in the
Agent Builder) found after each network-state change. Empty without an
ANTHROPIC_API_KEY: monitoring is honestly off, never faked."""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from hubris.agents.monitor import acknowledge_alert, clear_alerts, get_alerts

router = APIRouter()


class AlertInfo(BaseModel):
    id: int
    agent_name: str
    trigger: str
    answer: str
    verification: dict[str, Any] | None = None
    tool_calls: int
    status: str
    ts: float
    acknowledged: bool = False


@router.get("/alerts", response_model=list[AlertInfo])
def list_alerts() -> list[AlertInfo]:
    return [AlertInfo(**alert) for alert in get_alerts()]


@router.patch("/alerts/{alert_id}/acknowledge", status_code=204)
def acknowledge(alert_id: int) -> None:
    """Minimal acknowledge endpoint — flips the stored flag, nothing more."""
    if not acknowledge_alert(alert_id):
        raise HTTPException(404, f"Unknown alert id: {alert_id}")


@router.delete("/alerts", status_code=204)
def delete_alerts() -> None:
    clear_alerts()
