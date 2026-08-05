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
from tests.fixtures.messy_excel import (
    FLEET_ROWS,
    GRANULAR_ZONES_ROWS,
    HUBS_ROWS,
    ZONES_ROWS,
    build_workbook,
)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _isolate_state():
    original_baseline = app_state.baseline
    original_scenarios = dict(app_state.scenarios)
    original_labels = dict(app_state.scenario_labels)
    original_distance_mode = app_state.distance_mode
    original_agents = dict(builder._agents)
    # Boot now seeds the REAL Dataset G twin (demo re-seed, 2026-08-05).
    # These are engine-correspondence tests hand-checked against the
    # synthetic fixture, so each starts from a fresh synthetic baseline;
    # tests about the real seeded demo call seed_demo_scenario themselves.
    from hubris.core.contracts import NetworkModel
    from hubris.data.synthetic import generate_synthetic_raw_tables

    app_state.reset_baseline(NetworkModel.from_raw_tables(generate_synthetic_raw_tables()))
    yield
    app_state.baseline = original_baseline
    app_state.scenarios = original_scenarios
    app_state.scenario_labels = original_labels
    app_state.distance_mode = original_distance_mode
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


def test_scenarios_lists_all_nine_registered_modules(client):
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
        "change_hub_capacity",
        "shift_service_mix",
        "change_workforce",
        "absorb_hub",
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
    assert body["hubs"][0]["cost_to_serve"] >= 0
    assert len(body["fleet_types"]) == 4
    # T-19: the synthetic baseline is built via the same haversine formula
    # as the fallback path -> flagged as fallback until real distances are
    # explicitly refreshed, never silently implied to be real road data.
    assert body["distance_mode"] == "haversine_fallback"


def test_refresh_distances_without_osrm_uses_fallback_and_updates_state(client):
    before = client.get("/network").json()
    assert before["distance_mode"] == "haversine_fallback"

    response = client.post("/network/refresh-distances", params={"use_osrm": False})
    assert response.status_code == 200
    body = response.json()
    assert body["distance_mode"] == "haversine_fallback"
    assert body["od_pairs_updated"] == 9 * 100
    assert body["cost_to_serve_before"] == 57.0949

    # the mode is now recorded on state and reflected back via /network too
    after = client.get("/network").json()
    assert after["distance_mode"] == "haversine_fallback"


def test_opportunities_returns_all_three_types(client):
    response = client.get("/opportunities")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "overlapping_coverage",
        "far_hub_service",
        "idle_next_to_overload",
        "total_opportunities",
        "inefficiency_types_found",
    }
    # matches the live scan on the T-04 synthetic dataset: overlapping
    # coverage (H1/H2 both busy Abu Dhabi hubs) and idle-next-to-overload
    # both fire; far_hub_service is legitimately empty (the nearest-hub
    # baseline is already near-cost-optimal on this seed).
    assert len(body["overlapping_coverage"]) > 0
    assert len(body["idle_next_to_overload"]) > 0
    assert body["inefficiency_types_found"] >= 2


def test_opportunities_unknown_scenario_id_is_404(client):
    response = client.get("/opportunities", params={"scenario_id": "does-not-exist"})
    assert response.status_code == 404


def test_threshold_demand_growth_matches_the_engine(client):
    response = client.get("/threshold/demand-growth", params={"hub_id": "H1"})
    assert response.status_code == 200
    body = response.json()
    assert body["threshold_found"] is True
    assert body["hub_id"] == "H1"
    assert body["hub_utilization_pct"] == 100.0
    assert 5.0 <= body["growth_factor_threshold"] <= 5.3  # empirically ~5.16 on the T-04 dataset


def test_threshold_demand_growth_unknown_hub_is_400(client):
    response = client.get("/threshold/demand-growth", params={"hub_id": "NOPE"})
    assert response.status_code == 400


def test_threshold_customer_count_matches_the_engine(client):
    # The full T-04 network has deep enough network-wide reroute capacity
    # (generous 12/24/48h SLA windows let overflow reach distant hubs) that
    # no single emirate's customer growth alone exhausts it within 30 added
    # customers — a legitimate, honest "not found" result, not a bug.
    response = client.get(
        "/threshold/customer-count", params={"emirate": "Fujairah", "max_customer_count": 30}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["threshold_found"] is False
    assert body["emirate"] == "Fujairah"
    assert body["searched_up_to_customer_count"] >= 30


def test_threshold_customer_count_unknown_emirate_is_400(client):
    response = client.get("/threshold/customer-count", params={"emirate": "Atlantis"})
    assert response.status_code == 400


def test_goal_loop_via_api_structured_targets_no_llm(client):
    # T-34: the loop is user-reachable through the API, LLM-free via
    # structured targets. Unconstrained optimum on the T-04 dataset is the
    # hand-checked 11.89% reduction -> an 8% target succeeds in 1 iteration.
    response = client.post(
        "/goal", json={"targets": {"target_cost_reduction_pct": 8.0, "max_utilization": None}}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["achieved_pct_reduction"] == 11.89
    assert len(body["path"]) == 1  # the path explored is in the response, per ticket
    assert body["path"][0]["changes"]  # real recommendation content, not a summary

    # unreachable target WITH a cap -> iterates, relaxing the cap each step
    response = client.post(
        "/goal",
        json={
            "targets": {"target_cost_reduction_pct": 99.0, "max_utilization": 0.2},
            "max_iterations": 3,
        },
    )
    body = response.json()
    assert body["success"] is False
    assert len(body["path"]) == 3
    caps = [step["constraints"][0]["value"] for step in body["path"]]
    assert caps == sorted(caps) and len(set(caps)) == 3  # cap genuinely relaxed per iteration


def test_goal_loop_via_api_requires_objective_or_targets(client):
    assert client.post("/goal", json={}).status_code == 400


def test_goal_loop_unknown_scenario_is_404(client):
    response = client.post(
        "/goal",
        json={"targets": {"target_cost_reduction_pct": 5.0}, "scenario_id": "nope"},
    )
    assert response.status_code == 404


def test_bottleneck_reports_nothing_binding_on_the_baseline(client):
    response = client.get("/bottleneck")
    assert response.status_code == 200
    body = response.json()
    assert body["bottleneck_found"] is False


def test_bottleneck_finds_a_verified_unlock_after_stressing_the_network(client):
    stress = client.post(
        "/simulate",
        json={"scenario_name": "demand_scale", "params": {"factor": 5.0}, "save_as": "bottleneck_stress"},
    )
    assert stress.status_code == 200

    response = client.get("/bottleneck", params={"scenario_id": "bottleneck_stress"})
    assert response.status_code == 200
    body = response.json()
    assert body["bottleneck_found"] is True
    assert body["recommendation"]["hub_id"] == "H5"
    assert body["recommendation"]["verified_cost_savings"] > 0
    assert body["recommendation"]["unlocked_zone_ids"]


def test_bottleneck_unknown_scenario_id_is_404(client):
    response = client.get("/bottleneck", params={"scenario_id": "does-not-exist"})
    assert response.status_code == 404


def test_brief_matches_the_engine(client):
    response = client.get("/brief")
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "generated_at",
        "summary",
        "current_state",
        "proposed_change",
        "cost_risk",
        "sensitivity",
        "what_it_unblocks",
    }
    # matches T-09/T-15's own hand-checked baseline optimize() result.
    assert {c["hub_id"] for c in body["proposed_change"]["changes"]} == {"H1", "H3", "H5", "H7"}
    assert body["proposed_change"]["objective_value"] == 215449.92
    assert body["current_state"]["cost_to_serve"] == 57.0949
    assert body["sensitivity"]["demand_variation_pct"] == 20.0
    assert str(body["cost_risk"]["cost_to_serve_before"]) in body["summary"]


def test_brief_unknown_scenario_id_is_404(client):
    response = client.get("/brief", params={"scenario_id": "does-not-exist"})
    assert response.status_code == 404


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


def test_agent_query_upstream_llm_failure_is_a_clean_503_not_a_crash(client, monkeypatch):
    # T-33 hardening, rule 4: observed live — the Anthropic key ran out of
    # credits and /agent/query returned a raw 500. Any agent-layer failure
    # must degrade to a 503 the UI can display; engine endpoints stay up.
    def _boom(*args, **kwargs):
        raise RuntimeError("credit balance is too low")

    monkeypatch.setattr("hubris.api.routers.agents.run_workforce_query", _boom)

    response = client.post("/agent/query", json={"question": "anything"})
    assert response.status_code == 503
    assert "Agent layer unavailable" in response.json()["detail"]
    assert "credit balance" in response.json()["detail"]

    # the deterministic engine is untouched by an agent-layer outage
    assert client.get("/kpis").status_code == 200


def test_agent_query_unknown_agent_is_still_404_not_503(client):
    response = client.post("/agent/query", json={"question": "q", "agent_name": "nope"})
    assert response.status_code == 404


def test_ingest_h3_toggle_collapses_granular_points_through_the_endpoint(client):
    # T-35: P1/P2 share an H3 res-5 cell, P3 is far away (fixture verified
    # against the h3 library in test_h3_zoning.py) -> 3 rows in, 2 zones out.
    workbook = build_workbook({"Hubs": HUBS_ROWS, "Zones": GRANULAR_ZONES_ROWS, "Fleet": FLEET_ROWS})
    response = client.post(
        "/ingest",
        params={"aggregate_zones_to_h3": "true", "h3_resolution": 5},
        files={"file": ("granular.xlsx", workbook.read(), "application/octet-stream")},
    )
    assert response.status_code == 200
    assert response.json()["zones"] == 2

    net = client.get("/network").json()
    assert len(net["zones"]) == 2
    assert all(z["id"].startswith("H3-") for z in net["zones"])

    # default stays off: same workbook, no toggle -> 3 untouched zones
    workbook = build_workbook({"Hubs": HUBS_ROWS, "Zones": GRANULAR_ZONES_ROWS, "Fleet": FLEET_ROWS})
    response = client.post(
        "/ingest", files={"file": ("granular.xlsx", workbook.read(), "application/octet-stream")}
    )
    assert response.json()["zones"] == 3


def test_simulate_and_optimize_record_episodes_and_memory_endpoint_serves_them(client):
    # T-38: every /simulate and /optimize run becomes a recallable episode.
    import uuid as _uuid
    from hubris.memory.store import memory as _memory

    if not _memory.available():
        pytest.skip("requires the live compose db (DATABASE_URL)")

    tag = _uuid.uuid4().hex[:8]
    r = client.post(
        "/simulate",
        json={"scenario_name": "demand_scale", "params": {"factor": 1.1}, "save_as": f"mem_{tag}"},
    )
    assert r.status_code == 200
    returned_cost = r.json()["scenario_kpis"]["cost_to_serve"]["value"]
    assert client.post("/optimize", json={}).status_code == 200

    body = client.get("/memory/episodes", params={"limit": 10}).json()
    assert body["available"] is True
    names = [e["content"]["scenario_name"] for e in body["episodes"]]
    assert "demand_scale" in names and "optimise_network" in names
    newest_sim = next(e for e in body["episodes"] if e["content"]["scenario_name"] == "demand_scale")
    assert newest_sim["provenance"].startswith("api:/simulate:")
    # the episode records EXACTLY what the API returned — same engine run
    assert newest_sim["content"]["kpis"]["cost_to_serve"]["value"] == returned_cost
    assert newest_sim["content"]["outcome"]["saved_as"] == f"mem_{tag}"


def test_demo_path_survives_memory_being_down(client, monkeypatch):
    # Sims' Wave-2 rule: memory must never be a new failure mode. Kill the
    # store's engine; /simulate still 200, /memory/episodes says available
    # false with an empty list — never an error.
    from sqlalchemy import create_engine as _ce
    from hubris.memory.store import memory as _memory

    monkeypatch.setattr(
        _memory, "_engine", _ce("postgresql+psycopg2://x:x@127.0.0.1:1/void", future=True)
    )

    r = client.post("/simulate", json={"scenario_name": "close_hub", "params": {"hub_id": "H1"}})
    assert r.status_code == 200
    assert r.json()["scenario_kpis"]["cost_to_serve"]["value"] > 0

    body = client.get("/memory/episodes").json()
    assert body == {"available": False, "episodes": [], "total_returned": 0}


def test_memory_facts_heuristics_endpoints_and_retire_switch(client):
    import uuid as _uuid
    from hubris.memory.store import memory as _memory, new_provenance as _prov

    if not _memory.available():
        pytest.skip("requires the live compose db (DATABASE_URL)")

    tag = _uuid.uuid4().hex[:6]
    _memory.record_fact(f"test.api.{tag}", {"x": 42.5}, provenance=_prov("test"))
    _memory.record_heuristic(
        name=f"api-h-{tag}",
        rule={"when": {"tool": "optimise_network"}, "then": {"advise": "check the hottest hub first"}},
        rationale="test",
        author="test",
        provenance=_prov("test"),
    )

    try:
        facts = client.get("/memory/facts", params={"key_prefix": f"test.api.{tag}"}).json()
        assert facts["available"] is True and facts["total_returned"] == 1
    finally:
        from sqlalchemy.orm import Session as _S
        from hubris.core.orm import MemoryFactORM as _F

        with _S(_memory._get_engine()) as _sess:
            _sess.query(_F).filter(_F.key == f"test.api.{tag}").delete()
            _sess.commit()

    # the stored heuristic is applied on a REAL /optimize call
    body = client.post("/optimize", json={}).json()
    assert f"api-h-{tag}" in {h["name"] for h in body["applied_heuristics"]}

    # planner retires it -> next run no longer carries it
    r = client.post(f"/memory/heuristics/api-h-{tag}/active", json={"active": False})
    assert r.status_code == 200
    body2 = client.post("/optimize", json={}).json()
    assert f"api-h-{tag}" not in {h["name"] for h in body2["applied_heuristics"]}

    heuristics = client.get("/memory/heuristics").json()
    mine = [h for h in heuristics["heuristics"] if h["key"] == f"api-h-{tag}"]
    assert mine and mine[0]["content"]["active"] is False  # retired, not deleted

    assert client.post("/memory/heuristics/nope/active", json={"active": False}).status_code == 404


def test_monitoring_status_run_once_alerts_and_ack(client):
    from hubris.memory.store import memory as _memory

    status = client.get("/monitoring/status").json()
    assert status["interval_seconds"] > 0 and "enabled" in status

    if not _memory.available():
        pytest.skip("requires the live compose db (DATABASE_URL)")

    # manual trigger with a cranked stress -> critical alert, end to end
    result = client.post("/monitoring/run-once", json={"stress_factor": 50.0}).json()
    created = [a["id"] for a in result["alerts_created"]]
    try:
        assert len(created) == 1
        feed = client.get("/memory/alerts").json()
        assert feed["available"] is True
        mine = [a for a in feed["alerts"] if a["id"] == created[0]]
        assert mine and mine[0]["severity"] == "critical"

        # acknowledge -> leaves the default feed, stays under include_acknowledged
        assert client.post(f"/memory/alerts/{created[0]}/ack").status_code == 200
        assert created[0] not in [a["id"] for a in client.get("/memory/alerts").json()["alerts"]]
        assert created[0] in [
            a["id"]
            for a in client.get("/memory/alerts", params={"include_acknowledged": "true"}).json()["alerts"]
        ]
        assert client.post("/memory/alerts/nope/ack").status_code == 404
    finally:
        from tests.test_monitoring import _delete_alerts

        _delete_alerts(created)

    # pause switch round-trips
    assert client.post("/monitoring/enabled", json={"enabled": False}).json()["enabled"] is False
    assert client.get("/monitoring/status").json()["enabled"] is False
    client.post("/monitoring/enabled", json={"enabled": True})


def test_baseline_provenance_is_labelled_end_to_end(client):
    # T-31: the synthetic baseline is a reconstruction and says so on every
    # surface — /network, /kpis' network_summary, and the brief's summary.
    assert client.get("/network").json()["baseline_provenance"] == "reconstructed_nearest_hub"
    assert (
        client.get("/kpis").json()["network_summary"]["baseline_provenance"]
        == "reconstructed_nearest_hub"
    )
    brief = client.get("/brief").json()
    assert brief["current_state"]["baseline_provenance"] == "reconstructed_nearest_hub"
    assert "RECONSTRUCTED nearest-hub proxy" in brief["summary"]


def test_baseline_provenance_flips_to_provided_when_assignments_are_ingested(client):
    # A workbook WITH a current-assignments sheet -> provenance flips, and
    # the brief's caveat disappears (no scary label where none is due).
    assignments_rows = [
        {"Zone ID": "Z1", "Hub ID": "H1", "Volume": 30.0},
        {"Zone ID": "Z2", "Hub ID": "H1", "Volume": 20.0},
        {"Zone ID": "Z3", "Hub ID": "H2", "Volume": 10.0},
    ]
    workbook = build_workbook(
        {
            "Hubs": HUBS_ROWS,
            "Zones": ZONES_ROWS,
            "Fleet": FLEET_ROWS,
            "Current Assignments": assignments_rows,
        }
    )
    response = client.post(
        "/ingest", files={"file": ("real.xlsx", workbook.read(), "application/octet-stream")}
    )
    assert response.status_code == 200

    assert client.get("/network").json()["baseline_provenance"] == "provided"
    brief = client.get("/brief").json()
    assert brief["current_state"]["baseline_provenance"] == "provided"
    assert "RECONSTRUCTED" not in brief["summary"]


def test_assumptions_endpoint_serves_the_labelled_registry(client):
    response = client.get("/assumptions")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 20
    assert set(body["counts_by_status"]) <= {"verified", "derived", "assumed"}
    names = {a["name"] for a in body["assumptions"]}
    assert {"road_factor", "avg_speed_kmh", "mc_trials", "frontier_max_hub_volume_share"} <= names
    # the honest number: most inputs are assumptions until T-28's real data
    assert body["counts_by_status"]["assumed"] >= 10


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
    # T-33: every agent response carries the runtime provenance verdict
    assert body["verification"]["status"] in {"verified", "regenerated"}, body["verification"]


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="requires a live ANTHROPIC_API_KEY")
def test_live_custom_agent_query(client):
    response = client.post(
        "/agent/query", json={"question": "Any spare capacity?", "agent_name": "capacity_watchdog"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["agent_name"] == "capacity_watchdog"
    assert body["tool_calls"]
