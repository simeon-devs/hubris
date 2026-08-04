"""Acknowledge flow for monitoring alerts: every alert carries a stable id
and an acknowledged flag; PATCH /alerts/{id}/acknowledge flips it once."""

import pytest
from fastapi.testclient import TestClient

from hubris.agents import monitor
from hubris.api.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _clean_alerts():
    monitor.clear_alerts()
    yield
    monitor.clear_alerts()


def _seed_alert() -> None:
    monitor.record_alert(
        {
            "agent_name": "capacity_watchdog",
            "trigger": "scenario saved: test",
            "answer": "All healthy.",
            "verification": {"grounded": True, "unexplained_numbers": [], "retried": False},
            "tool_calls": 2,
            "status": "ok",
            "ts": 1234.5,
        }
    )


def test_alerts_carry_id_and_acknowledged_default_false(client):
    _seed_alert()
    alerts = client.get("/alerts").json()
    assert len(alerts) == 1
    assert isinstance(alerts[0]["id"], int)
    assert alerts[0]["acknowledged"] is False


def test_acknowledge_flips_the_flag(client):
    _seed_alert()
    alert_id = client.get("/alerts").json()[0]["id"]

    response = client.patch(f"/alerts/{alert_id}/acknowledge")
    assert response.status_code == 204

    assert client.get("/alerts").json()[0]["acknowledged"] is True


def test_acknowledge_unknown_id_404s(client):
    assert client.patch("/alerts/99999/acknowledge").status_code == 404


def test_ids_are_unique_per_alert(client):
    _seed_alert()
    _seed_alert()
    ids = [a["id"] for a in client.get("/alerts").json()]
    assert len(set(ids)) == 2
