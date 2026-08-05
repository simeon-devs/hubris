"""GET /event/metrics — the dataset's OWN reported figures served verbatim
(ported from hubris-main, re-pointed at the canonical dataset_g.xlsx).
Every expected value below is readable straight off the workbook."""

from fastapi.testclient import TestClient

from hubris.api.main import app


def _payload() -> dict:
    with TestClient(app) as client:
        response = client.get("/event/metrics")
        assert response.status_code == 200
        return response.json()


def test_latest_week_hub_figures_and_official_at_risk():
    data = _payload()
    assert data["week"] == 13
    assert data["hub_count"] == 10
    # the file's own status column, not our computation
    assert data["at_risk"] == ["HUB_RAK_01"]
    assert data["at_risk_count"] == 1
    rak = data["hubs"]["HUB_RAK_01"]
    assert rak["status"] == "At Risk"
    assert set(rak) == {
        "courier_utilisation_pct",
        "vehicle_utilisation_pct",
        "on_time_delivery_pct",
        "first_attempt_success_pct",
        "capacity_headroom_pct",
        "sla_breach_count",
        "avg_delivery_time_min",
        "status",
    }


def test_baselines_and_weekly_series_come_from_the_sheet():
    data = _payload()
    assert len(data["baselines"]) == 7  # the Baseline_Metrics table rows
    assert len(data["weekly_demand"]) == 13
    assert data["weekly_demand"][0]["week"] == 1
    # the home page's demand line: H&S DAILY volumes, week 1 -> 13
    hs = data["weekly_hub_spoke_daily"]
    assert hs[0] == {"week": 1, "daily_volume": 979.0}
    assert hs[-1] == {"week": 13, "daily_volume": 1060.0}


def test_cost_per_shipment_is_the_files_own_fully_loaded_arithmetic():
    # total_cost / shipments per facility — reproduces examples/reconciliation.md
    cps = _payload()["cost_per_shipment"]
    assert cps["HUB_DXB_01"] == 49.51
    assert cps["HUB_FUJ_01"] == 151.68


def test_network_volumes_replace_the_uis_embedded_literals():
    volumes = _payload()["network_volumes"]
    # the home page's "+127" magic number was On-Demand's real daily volume
    assert volumes == {"Hub & Spoke": 1060.0, "QComm": 6138.0, "On-Demand": 127.0}
