"""Monitoring autonomy, made real (closes STATUS.md §2's "the field is
cosmetic" finding): every Agent-Builder agent whose `autonomy` is
"monitoring" is actually run after each event that changes network state —
an ingest, or a scenario being saved — and its (guardrail-verified) answer
is stored as an alert the UI can surface.

Runs in a daemon thread so the triggering request never waits on an LLM.
Without an ANTHROPIC_API_KEY the run is skipped and recorded as such —
monitoring is honestly unavailable then, never silently faked."""

import os
import threading
import time

from hubris.agents.builder import builder
from hubris.core.contracts import NetworkModel

# Newest first; bounded so a long demo can't grow it unbounded.
MAX_ALERTS = 50

_alerts: list[dict] = []
_lock = threading.Lock()
_next_id = 0


def get_alerts() -> list[dict]:
    with _lock:
        return list(_alerts)


def clear_alerts() -> None:
    with _lock:
        _alerts.clear()


def record_alert(alert: dict) -> None:
    """Store one alert, stamping a stable id + unacknowledged state."""
    global _next_id
    with _lock:
        _next_id += 1
        _alerts.insert(0, {**alert, "id": _next_id, "acknowledged": False})
        del _alerts[MAX_ALERTS:]


def acknowledge_alert(alert_id: int) -> bool:
    """Mark one alert acknowledged. Returns False when the id is unknown."""
    with _lock:
        for alert in _alerts:
            if alert.get("id") == alert_id:
                alert["acknowledged"] = True
                return True
    return False


# Backwards-compatible internal name.
_record = record_alert


def _watch_question(goal: str, trigger: str) -> str:
    return (
        f"The network state just changed ({trigger}). Acting on your standing "
        f"goal — {goal} — check the CURRENT network now using your tools and "
        "report anything a planner should know. If everything is healthy, say "
        "so in one sentence."
    )


def _run_one(agent_name: str, goal: str, model: NetworkModel, trigger: str) -> None:
    try:
        result = builder.run(agent_name, model, _watch_question(goal, trigger))
        _record(
            {
                "agent_name": agent_name,
                "trigger": trigger,
                "answer": result["answer"],
                "verification": result.get("verification"),
                "tool_calls": len(result["tool_calls"]),
                "status": "ok",
                "ts": time.time(),
            }
        )
    except Exception as exc:  # a broken watchdog must never break the app
        _record(
            {
                "agent_name": agent_name,
                "trigger": trigger,
                "answer": f"Monitoring run failed: {exc}",
                "verification": None,
                "tool_calls": 0,
                "status": "error",
                "ts": time.time(),
            }
        )


def notify_state_changed(model: NetworkModel, trigger: str) -> int:
    """Fire every monitoring agent against `model` in background threads.
    Returns how many were dispatched (0 without an API key)."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return 0
    specs = [spec for spec in builder.all() if spec.autonomy == "monitoring"]
    for spec in specs:
        threading.Thread(
            target=_run_one, args=(spec.name, spec.goal, model, trigger), daemon=True
        ).start()
    return len(specs)
