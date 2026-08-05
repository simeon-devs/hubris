"""The demo seed loads the REAL twin (Sims decision, 2026-08-05): boot
replaces the synthetic placeholder baseline with Dataset G's Hub & Spoke
network and saves the QComm dark-store network as `qcomm_twin` — the
seeded demo IS the real capacity crisis (genuinely infeasible, real unmet
demand in Abu Dhabi). Failure of any kind must leave the synthetic
baseline standing and never raise (the demo never hangs)."""

from hubris.api.state import AppState, seed_demo_scenario
from hubris.core.registry import load_plugins
from hubris.engine.flow import solve_min_cost_flow


def _seeded_state() -> AppState:
    load_plugins()
    state = AppState()
    assert seed_demo_scenario(state) == "qcomm_twin"
    return state


def test_seed_replaces_the_synthetic_baseline_with_the_real_twin():
    state = _seeded_state()
    assert len(state.baseline.hubs) == 13  # 10 active + 3 candidates
    assert state.baseline.baseline_provenance == "provided"  # T-31 on real data
    assert state.baseline.assignments["Dubai-Al_Quoz-Standard"] == "HUB_DXB_01"


def test_seeded_qcomm_twin_is_the_real_crisis():
    state = _seeded_state()
    assert state.scenario_labels["qcomm_twin"] == "QComm twin (dark stores)"

    qcomm = state.get_model("qcomm_twin")
    assert len(qcomm.hubs) == 10  # dark stores
    flow = solve_min_cost_flow(qcomm)
    # the crisis is the point: genuinely infeasible, unmet Abu Dhabi demand
    assert flow.feasible is False
    assert set(flow.unmet_demand) == {"Abu_Dhabi-Al_Reem", "Abu_Dhabi-Khalidiyah"}
    assert sum(flow.unmet_demand.values()) == 17.0


def test_seed_failure_leaves_the_synthetic_baseline_standing(monkeypatch):
    from hubris.ingestion import dataset_g_connector

    load_plugins()
    state = AppState()
    synthetic_hub_count = len(state.baseline.hubs)

    def _boom(self, source, network="hub_spoke", **kwargs):
        raise RuntimeError("file unreadable")

    monkeypatch.setattr(dataset_g_connector.DatasetGConnector, "load", _boom)

    assert seed_demo_scenario(state) is None  # swallowed, never raised
    assert len(state.baseline.hubs) == synthetic_hub_count  # untouched
    assert state.scenarios == {}
