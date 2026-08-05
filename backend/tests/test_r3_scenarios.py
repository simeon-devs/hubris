"""R3 scenario modules against the REAL twin — hand-checkable params in,
engine-visible effects out. All three are registered, so they appear in
GET /scenarios, as agent tools, and over MCP with zero wiring."""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.core.registry import SCENARIO, load_plugins
from hubris.core.registry import registry
from hubris.ingestion.dataset_g_connector import DatasetGConnector

REAL_FILE = "hubris/data/dataset_g.xlsx"


@pytest.fixture(scope="module")
def real_model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(DatasetGConnector().load(REAL_FILE, network="hub_spoke"))


def test_all_three_are_registered(real_model):
    names = {s.name for s in registry.all(SCENARIO)}
    assert {"change_hub_capacity", "shift_service_mix", "change_workforce"} <= names


def test_resize_scales_or_sets_capacity(real_model):
    scenario = registry.get(SCENARIO, "change_hub_capacity")
    halved = scenario.apply(real_model, {"hub_id": "HUB_DXB_01", "factor": 0.5})
    assert next(h for h in halved.hubs if h.id == "HUB_DXB_01").capacity == 1750.0
    absolute = scenario.apply(real_model, {"hub_id": "HUB_DXB_01", "new_capacity": 900})
    assert next(h for h in absolute.hubs if h.id == "HUB_DXB_01").capacity == 900.0
    # the original model is never mutated (contract: modified COPY)
    assert next(h for h in real_model.hubs if h.id == "HUB_DXB_01").capacity == 3500.0
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"hub_id": "HUB_DXB_01"})  # neither param


def test_shift_moves_express_onto_standard_siblings(real_model):
    scenario = registry.get(SCENARIO, "shift_service_mix")
    before_express = sum(z.demand for z in real_model.zones if z.service_model == "Express")
    before_total = sum(real_model.demand.values())

    shifted = scenario.apply(real_model, {"pct": 20})
    after_express = sum(z.demand for z in shifted.zones if z.service_model == "Express")
    after_total = sum(shifted.demand.values())

    assert after_express == pytest.approx(before_express * 0.8, abs=0.1)
    assert after_total == pytest.approx(before_total, abs=0.1)  # demand conserved
    # a concrete pair: Al Quoz Express 81 -> 64.8, its Standard 149 -> 165.2
    z = {x.id: x.demand for x in shifted.zones}
    assert z["Dubai-Al_Quoz-Express"] == pytest.approx(64.8)
    assert z["Dubai-Al_Quoz-Standard"] == pytest.approx(165.2)


def test_workforce_recomputes_capacity_and_cost_from_real_rates(real_model):
    scenario = registry.get(SCENARIO, "change_workforce")
    changed = scenario.apply(real_model, {"hub_id": "HUB_DXB_01", "fte_delta": -20, "ftc_delta": 20})
    hub = next(h for h in changed.hubs if h.id == "HUB_DXB_01")
    assert hub.riders_fte == 66 and hub.riders_ftc == 74
    # capacity moves by the per-type dpd (67.48 FTE / 71.54 FTC — real file)
    assert hub.rider_capacity_daily == pytest.approx(9666.0 - 20 * 67.48 + 20 * 71.54, abs=0.5)
    # cost moves by the real rates: -20x3200 +20x2400 = -16,000 AED/week
    assert hub.rider_weekly_cost == pytest.approx(404800.0 - 16000.0, abs=1.0)

    with pytest.raises(ValueError):
        scenario.apply(real_model, {"hub_id": "HUB_DXB_01", "fte_delta": -999})
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"hub_id": "CAND_DXB_01", "fte_delta": 1})  # no roster


def test_simulate_endpoint_runs_the_new_modules():
    from fastapi.testclient import TestClient

    from hubris.api.main import app

    with TestClient(app) as client:  # boot = the real twin
        r = client.post(
            "/simulate",
            json={"scenario_name": "shift_service_mix", "params": {"pct": 20}},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["scenario_flow_feasible"] is True
        assert set(body["delta_pct"]) >= {"cost_to_serve", "utilization"}


def test_add_hub_respects_service_capability(real_model):
    scenario = registry.get(SCENARIO, "add_hub")
    micro = scenario.apply(real_model, {
        "id": "NEW_MICRO", "name": "New Micro", "lat": 25.2, "lon": 55.3,
        "emirate": "Dubai", "capacity": 800, "fixed_cost": 1500, "handling_cost": 10.8,
        "hub_type": "Micro Hub", "service_models": ["Standard"],
    })
    express_zones = {z.id for z in micro.zones if z.service_model == "Express"}
    assert not any(k == ("NEW_MICRO", z) for k in micro.od_matrix for z in express_zones)
    assert any(k[0] == "NEW_MICRO" for k in micro.od_matrix)  # Standard edges exist


def test_demand_scale_scopes_to_a_service_model(real_model):
    scenario = registry.get(SCENARIO, "demand_scale")
    surged = scenario.apply(real_model, {"factor": 1.5, "service_model": "Express"})
    before = {z.id: z.demand for z in real_model.zones}
    for z in surged.zones:
        if z.service_model == "Express":
            assert z.demand == pytest.approx(before[z.id] * 1.5, abs=0.01)
        else:
            assert z.demand == before[z.id]
