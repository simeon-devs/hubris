"""GET /event/metrics — official per-hub performance (latest week), baseline
targets, and 13-week demand, read verbatim from the event workbook."""

import pytest
from fastapi.testclient import TestClient

from hubris.api.main import app
from hubris.api.routers import event_metrics


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_404_when_workbook_missing(client, tmp_path, monkeypatch):
    monkeypatch.setattr(event_metrics, "RAW_WORKBOOK", tmp_path / "missing.xlsx")
    assert client.get("/event/metrics").status_code == 404


def test_latest_week_hub_statuses_verbatim(client):
    response = client.get("/event/metrics")
    assert response.status_code == 200
    body = response.json()

    assert body["week"] == 13
    assert body["hub_count"] == 10
    assert len(body["hubs"]) == 10
    # LIVE latest-week count, verbatim from Network_Performance (the
    # baseline table's "3 of 10" is the baseline-period figure, served
    # separately under baselines). Week 13 in the shipped file has 1.
    assert body["at_risk_count"] == len(body["at_risk"])
    assert body["at_risk_count"] == sum(
        1 for hub in body["hubs"].values() if hub["status"] == "At Risk"
    )
    assert body["at_risk_count"] == 1
    for hub in body["hubs"].values():
        assert hub["status"] in {"At Risk", "High Load", "Normal"}
        assert "courier_utilisation_pct" in hub
        assert "on_time_delivery_pct" in hub
        assert "capacity_headroom_pct" in hub


def test_baselines_and_weekly_demand_present(client):
    body = client.get("/event/metrics").json()
    metrics = [b["metric"] for b in body["baselines"]]
    assert "Hubs flagged as At Risk" in metrics
    at_risk = next(b for b in body["baselines"] if b["metric"] == "Hubs flagged as At Risk")
    assert at_risk["current"] == "3 of 10 hubs"
    assert at_risk["target"] == "0–1 hubs"

    weeks = [w["week"] for w in body["weekly_demand"]]
    assert weeks == list(range(1, 14))  # the 13-week line chart series
    assert all(w["total_volume"] > 0 for w in body["weekly_demand"])
