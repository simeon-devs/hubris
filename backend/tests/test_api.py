"""Tests for T-15's FastAPI routers, against the real synthetic dataset
(T-04) and the real engine/agent tools (T-07-T-14) — no mocking. State is
snapshotted/restored around every test since `state`/`builder` are process-
wide singletons the app itself uses.

Numbers asserted below are the same hand-checked/empirically-captured
values from T-07/T-09's own test suites (baseline cost_to_serve=57.0949,
optimal changes = close H1/H3/H5/H7 at objective_value=215449.92) —
proving the API returns exactly what the engine computes, nothing else.
"""

import io
import os

import pytest
from fastapi.testclient import TestClient

from hubris.agents.builder import builder
from hubris.api.main import app
from hubris.api.state import state as app_state
from tests.fixtures.messy_excel import FLEET_ROWS, HUBS_ROWS, ZONES_ROWS, build_workbook


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _isolate_state():
    original_baseline = app_state.baseline
    original_scenarios = dict(app_state.scenarios)
    original_agents = dict(builder._agents)
    yield
    app_state.baseline = original_baseline
    app_state.scenarios = original_scenarios
    builder._agents = original_agents


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_kpis_matches_the_engine(client):
    response = client.get("/kpis")
    assert response.status_code == 200
    body = response.json()
    assert body["cost_to_serve"]["value"] == 57.0949
    assert body["network_summary"]["hub_count"] == 9


def test_kpis_unknown_scenario_id_is_404(client):
    response = client.get("/kpis", params={"scenario_id": "does-not-exist"})
    assert response.status_code == 404


def test_scenarios_lists_all_six_registered_modules(client):
    response = client.get("/scenarios")
    assert response.status_code == 200
    names = {s["name"] for s in response.json()}
    assert names == {
        "move_hub",
        "close_hub",
        "add_hub",
        "change_fleet_mix",
        "add_customer",
        "demand_scale",
    }


def test_simulate_matches_the_engine_and_can_be_saved(client):
    response = client.post(
        "/simulate",
        json={"scenario_name": "demand_scale", "params": {"factor": 1.2}, "save_as": "demand_up_20"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["scenario_kpis"]["cost_to_serve"]["value"] == 52.7358
    assert body["scenario_id"] == "demand_up_20"

    # the saved scenario is now independently queryable
    saved = client.get("/kpis", params={"scenario_id": "demand_up_20"})
    assert saved.status_code == 200
    assert saved.json()["cost_to_serve"]["value"] == 52.7358

    # baseline is untouched
    baseline = client.get("/kpis")
    assert baseline.json()["cost_to_serve"]["value"] == 57.0949


def test_simulate_unknown_scenario_name_is_400(client):
    response = client.post("/simulate", json={"scenario_name": "not_a_scenario", "params": {}})
    assert response.status_code == 400


def test_optimize_matches_t09_hand_checked_result(client):
    response = client.post("/optimize", json={})
    assert response.status_code == 200
    body = response.json()
    assert {c["hub_id"] for c in body["changes"]} == {"H1", "H3", "H5", "H7"}
    assert body["objective_value"] == 215449.92
    assert body["delta_vs_baseline"]["cost_to_serve_pct"] == -11.89


def test_optimize_unknown_optimizer_name_is_400(client):
    response = client.post("/optimize", json={"optimizer_name": "not_a_solver"})
    assert response.status_code == 400


def test_network_returns_hubs_zones_and_flows(client):
    response = client.get("/network")
    assert response.status_code == 200
    body = response.json()
    assert len(body["hubs"]) == 9
    assert len(body["zones"]) == 100
    assert len(body["flows"]) > 0
    assert body["hubs"][0]["utilization_pct"] >= 0


def test_ingest_replaces_the_baseline(client):
    workbook = build_workbook({"Hubs": HUBS_ROWS, "Zones": ZONES_ROWS, "Fleet": FLEET_ROWS})
    response = client.post(
        "/ingest", files={"file": ("test.xlsx", workbook.read(), "application/octet-stream")}
    )
    assert response.status_code == 200
    assert response.json() == {
        "hubs": 2,
        "zones": 3,
        "fleet_types": 1,
        "od_matrix": 6,
        "current_assignments": 3,
    }

    net = client.get("/network")
    assert len(net.json()["hubs"]) == 2
    assert len(net.json()["zones"]) == 3


def test_agents_crud_lifecycle(client):
    create = client.post(
        "/agents", json={"name": "api_test_agent", "goal": "test", "allowed_tools": ["get_kpis"]}
    )
    assert create.status_code == 201

    duplicate = client.post(
        "/agents", json={"name": "api_test_agent", "goal": "x", "allowed_tools": ["get_kpis"]}
    )
    assert duplicate.status_code == 409

    unknown_tool = client.post(
        "/agents", json={"name": "bad_agent", "goal": "x", "allowed_tools": ["not_a_real_tool"]}
    )
    assert unknown_tool.status_code == 400

    got = client.get("/agents/api_test_agent")
    assert got.status_code == 200
    assert got.json()["goal"] == "test"

    updated = client.put(
        "/agents/api_test_agent",
        json={"name": "api_test_agent", "goal": "updated", "allowed_tools": ["get_kpis", "find_spare_capacity"]},
    )
    assert updated.status_code == 200
    assert updated.json()["allowed_tools"] == ["get_kpis", "find_spare_capacity"]

    listed = client.get("/agents")
    assert "api_test_agent" in {a["name"] for a in listed.json()}

    deleted = client.delete("/agents/api_test_agent")
    assert deleted.status_code == 204

    gone = client.get("/agents/api_test_agent")
    assert gone.status_code == 404


def test_agents_default_templates_are_present(client):
    names = {a["name"] for a in client.get("/agents").json()}
    assert {"capacity_watchdog", "cost_advisor", "whatif_explorer"} <= names


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="requires a live ANTHROPIC_API_KEY")
def test_live_agent_query_preserves_tool_provenance(client):
    response = client.post("/agent/query", json={"question": "What is our cost-to-serve?"})
    assert response.status_code == 200
    body = response.json()
    assert body["role"] is not None
    assert body["tool_calls"], "no tool calls returned — provenance trail missing"
    assert isinstance(body["tool_calls"][0]["result"], dict), "tool result wasn't parsed as JSON"


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="requires a live ANTHROPIC_API_KEY")
def test_live_custom_agent_query(client):
    response = client.post(
        "/agent/query", json={"question": "Any spare capacity?", "agent_name": "capacity_watchdog"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["agent_name"] == "capacity_watchdog"
    assert body["tool_calls"]
