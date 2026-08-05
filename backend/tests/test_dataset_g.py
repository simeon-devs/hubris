"""T-28: the Dataset-G connector against the REAL event file
(`hubris/data/dataset_g.xlsx`) — counts, candidate statuses, provided
assignments (T-31 flip), pool purity, calibrated costs, SLA mapping, and
the registry auto-pick through the real /ingest endpoint."""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.core.registry import load_plugins
from hubris.ingestion.dataset_g_connector import DatasetGConnector

REAL_FILE = "hubris/data/dataset_g.xlsx"


def _load(network: str):
    load_plugins()
    return DatasetGConnector().load(REAL_FILE, network=network)


def test_fingerprint_matches_the_real_file_only():
    c = DatasetGConnector()
    assert c.can_handle(REAL_FILE) == 1.0
    assert c.can_handle("not-a-file.xlsx") == 0.0


def test_hub_spoke_twin_shape_and_candidates():
    raw = _load("hub_spoke")
    assert len(raw.hubs) == 13 and len(raw.zones) == 11
    assert len(raw.fleet_types) == 40 and len(raw.od_matrix) == 13 * 11
    statuses = {h["id"]: h["status"] for h in raw.hubs}
    assert [k for k, v in statuses.items() if v == "candidate"] == [
        "CAND_DXB_01", "CAND_AUH_01", "CAND_SHJ_01",
    ]
    # period-normalised money: DXB_01 rent 180000/30
    dxb1 = next(h for h in raw.hubs if h["id"] == "HUB_DXB_01")
    assert dxb1["fixed_cost"] == 6000.0 and dxb1["capacity"] == 3500.0
    # calibrated handling from the file's own cost sheet:
    # (labour 11696+6689 + vehicle 3392+1888) / (3200+1600) = 4.93
    assert dxb1["handling_cost"] == 4.93


def test_provided_assignments_flip_baseline_provenance():
    raw = _load("hub_spoke")
    assert raw.assignments_provided is True
    model = NetworkModel.from_raw_tables(raw)
    assert model.baseline_provenance == "provided"  # T-31 on real data
    # the file's own serving map, not a reconstruction
    assert model.assignments["Dubai-Al_Quoz"] == "HUB_DXB_01"
    assert model.assignments["Dubai-Business_Bay"] == "HUB_DXB_01"


def test_candidate_handling_is_pool_pure_median():
    raw = _load("hub_spoke")
    active = sorted(
        h["handling_cost"] for h in raw.hubs if h["status"] == "open"
    )
    expected_median = round((active[4] + active[5]) / 2, 2)  # 10 actives
    cand = next(h for h in raw.hubs if h["status"] == "candidate")
    assert cand["handling_cost"] == expected_median == 5.01  # H&S-only pool


def test_qcomm_twin_shape_and_sla():
    raw = _load("qcomm")
    assert len(raw.hubs) == 10 and len(raw.zones) == 10
    assert all(h["status"] == "open" for h in raw.hubs)  # no QComm candidates
    slas = {z["id"]: z["sla_hours"] for z in raw.zones}
    assert slas["Sharjah-Al_Nahda_SHJ"] == pytest.approx(20 / 60)  # SHJ store's 20-min target
    assert all(v == pytest.approx(15 / 60) for k, v in slas.items() if k != "Sharjah-Al_Nahda_SHJ")
    # dark stores have no rent: fixed = monthly overhead / 30
    q1 = next(h for h in raw.hubs if h["id"] == "QED_DXB_01")
    assert q1["fixed_cost"] == round(25247 / 30, 2)


def test_unknown_network_is_refused():
    with pytest.raises(ValueError):
        _load("on_demand")  # report-only by decision — no twin


def test_ingest_endpoint_autopicks_dataset_g_and_loads_both_twins():
    from fastapi.testclient import TestClient

    from hubris.api.main import app
    from hubris.api.state import state as app_state

    original = (app_state.baseline, dict(app_state.scenarios), app_state.distance_mode)
    try:
        with TestClient(app) as client:
            content = open(REAL_FILE, "rb").read()
            # no connector param: the fingerprint outranks the generic path
            r = client.post(
                "/ingest", files={"file": ("renamed_on_the_day.xlsx", content, "application/octet-stream")}
            )
            assert r.status_code == 200
            assert r.json() == {
                "hubs": 13, "zones": 11, "fleet_types": 40,
                "od_matrix": 143, "current_assignments": 11,
            }
            net = client.get("/network").json()
            assert net["baseline_provenance"] == "provided"
            assert len(net["hubs"]) == 13

            # QComm rides the scenario picker — side by side, never blended
            r2 = client.post(
                "/ingest",
                params={"network": "qcomm"},
                files={"file": ("g.xlsx", content, "application/octet-stream")},
            )
            assert r2.status_code == 200
            saved = {s["id"]: s["label"] for s in client.get("/scenarios/saved").json()}
            assert saved.get("qcomm_twin") == "QComm twin (dark stores)"
            qnet = client.get("/network", params={"scenario_id": "qcomm_twin"}).json()
            assert len(qnet["hubs"]) == 10
    finally:
        app_state.baseline, app_state.scenarios, app_state.distance_mode = original
