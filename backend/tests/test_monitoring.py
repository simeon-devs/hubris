"""T-40: closed-loop monitoring. The sweep runs REAL simulations (stressed
demand re-solved through the flow LP), alerts carry computed findings +
recommended actions, dedup prevents card walls, and everything degrades
gracefully with memory down. Live-DB tests skip without the compose db."""

import uuid

import pytest
from sqlalchemy import create_engine

from hubris.api.state import AppState, seed_demo_scenario
from hubris.core.registry import load_plugins
from hubris.memory.store import memory
from hubris.monitoring import watchdog

pytestmark = []


def _clean_state() -> AppState:
    load_plugins()
    return AppState()


def _require_db():
    if not memory.available():
        pytest.skip("requires the live compose db (DATABASE_URL)")


def _delete_alerts(ids: list[str]) -> None:
    from sqlalchemy.orm import Session

    from hubris.core.orm import MemoryAlertORM

    with Session(memory._get_engine()) as session:
        for alert_id in ids:
            row = session.get(MemoryAlertORM, alert_id)
            if row is not None:
                session.delete(row)
        session.commit()


def test_healthy_baseline_produces_no_alert():
    _require_db()
    state = _clean_state()  # no saved scenarios; baseline stressed x1.2 stays cool

    result = watchdog.run_sweep(state)

    assert result["memory_available"] is True
    assert result["errors"] == []
    assert result["alerts_created"] == []
    assert any(t.startswith("baseline+") for t in result["targets_checked"])


def test_seeded_crisis_produces_critical_alert_with_recommended_action():
    _require_db()
    state = _clean_state()
    seed_demo_scenario(state)  # real twin: qcomm_twin is genuinely infeasible

    # The RUNNING app's boot sweep may already hold this alert in the
    # shared db (that's the designed behaviour) — dedup would then rightly
    # suppress ours. Own the slate: clear existing qcomm_twin alerts first.
    preexisting = [
        a["id"]
        for a in memory.list_alerts(include_acknowledged=True, limit=200)
        if a["finding"].get("target") == "qcomm_twin"
    ]
    _delete_alerts(preexisting)

    created: list[str] = []
    try:
        result = watchdog.run_sweep(state)
        created = [a["id"] for a in result["alerts_created"]]
        targets = [a["target"] for a in result["alerts_created"]]
        assert "qcomm_twin" in targets

        alerts = [
            a
            for a in memory.list_alerts(include_acknowledged=False, limit=100)
            if a["id"] in created and a["finding"]["target"] == "qcomm_twin"
        ]
        assert len(alerts) == 1
        alert = alerts[0]
        # the crisis is real: infeasible -> critical, with the shortfall
        # listed per zone straight from the flow solve
        assert alert["severity"] == "critical"
        assert alert["agent_name"] == "capacity_watchdog"
        assert alert["finding"]["feasible"] is False
        assert set(alert["finding"]["unmet_demand"]) == {
            "Abu_Dhabi-Al_Reem",
            "Abu_Dhabi-Khalidiyah",
        }
        assert sum(alert["finding"]["unmet_demand"].values()) == 17.0
        # a computed recommended action always ships with the card
        assert alert["recommended_action"]["action"] in {"add_capacity", "review_robustness"}
        assert alert["recommended_action"]["source_tool"]
        assert alert["brief_link"] == "/brief?scenario_id=qcomm_twin"
        assert alert["provenance"].startswith("watchdog:sweep:")

        # dedup: a second sweep must NOT stack an identical card
        again = watchdog.run_sweep(state)
        assert "qcomm_twin" not in [a["target"] for a in again["alerts_created"]]
    finally:
        _delete_alerts(created)


def test_infeasible_stress_is_critical():
    _require_db()
    state = _clean_state()

    created: list[str] = []
    try:
        # x50 demand: total ~214k vs ~27k capacity -> genuinely unservable
        result = watchdog.run_sweep(state, stress_factor=50.0)
        created = [a["id"] for a in result["alerts_created"]]
        assert len(created) == 1
        alert = [a for a in memory.list_alerts(limit=100) if a["id"] == created[0]][0]
        assert alert["severity"] == "critical"
        assert alert["finding"]["unmet_demand"]  # real shortfall, listed per zone
    finally:
        _delete_alerts(created)


def test_sweep_with_memory_down_computes_but_drops_alerts(monkeypatch):
    state = _clean_state()
    seed_demo_scenario(state)
    monkeypatch.setattr(
        memory, "_engine", create_engine("postgresql+psycopg2://x:x@127.0.0.1:1/void", future=True)
    )

    result = watchdog.run_sweep(state)

    assert result["memory_available"] is False
    assert result["alerts_created"] == []
    assert result["alerts_dropped_memory_unavailable"] >= 1  # qcomm_twin WAS detected
    assert result["errors"] == []
