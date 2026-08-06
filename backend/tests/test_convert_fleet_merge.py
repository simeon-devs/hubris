"""The last three catalog scenarios — convert_hub_type, merge_zones, and
the upgraded change_fleet_mix (+ /network fleet aggregates). Real-twin
capability checks, tiny-fixture hand maths, contract (no-mutation) checks."""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.core.registry import SCENARIO, load_plugins, registry
from hubris.engine.flow import solve_min_cost_flow
from hubris.ingestion.dataset_g_connector import DatasetGConnector
from tests.fixtures.tiny_network import TINY_RAW_TABLES

REAL_FILE = "hubris/data/dataset_g.xlsx"


@pytest.fixture(scope="module")
def real_model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(DatasetGConnector().load(REAL_FILE, network="hub_spoke"))


def _tiny() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES.model_copy(deep=True))


# ---- convert_hub_type ------------------------------------------------------


def test_micro_to_full_gains_express_edges(real_model):
    scenario = registry.get(SCENARIO, "convert_hub_type")
    express_zones = [z.id for z in real_model.zones if z.service_model == "Express"]
    assert not any(("HUB_AUH_02", z) in real_model.od_matrix for z in express_zones)

    out = scenario.apply(real_model, {"hub_id": "HUB_AUH_02", "to": "Full Hub"})

    hub = next(h for h in out.hubs if h.id == "HUB_AUH_02")
    assert hub.hub_type == "Full Hub"
    assert hub.service_models == ["Standard", "Express"]
    # real edges to EVERY Express zone, priced like add_hub would price them
    assert all(("HUB_AUH_02", z) in out.od_matrix for z in express_zones)
    edge = out.od_matrix[("HUB_AUH_02", express_zones[0])]
    assert edge.cost > 0 and edge.distance_km >= 0
    # input untouched
    assert next(h for h in real_model.hubs if h.id == "HUB_AUH_02").hub_type == "Micro Hub"


def test_full_to_micro_drops_express_edges_and_flow_stays_honest(real_model):
    scenario = registry.get(SCENARIO, "convert_hub_type")
    out = scenario.apply(real_model, {"hub_id": "HUB_DXB_01", "to": "Micro Hub"})

    express_zones = {z.id for z in out.zones if z.service_model == "Express"}
    assert not any(k[0] == "HUB_DXB_01" and k[1] in express_zones for k in out.od_matrix)
    # Al Quoz/Business Bay Express must land somewhere else (or be unmet) —
    # never silently stay on a hub that can no longer carry them.
    flow = solve_min_cost_flow(out)
    for hub_id, zone_volumes in flow.flows.items():
        if hub_id == "HUB_DXB_01":
            assert not (set(zone_volumes) & express_zones)


def test_convert_validates(real_model):
    scenario = registry.get(SCENARIO, "convert_hub_type")
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"hub_id": "NOPE", "to": "Full Hub"})
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"hub_id": "HUB_DXB_01", "to": "Full Hub"})  # already Full
    with pytest.raises(ValueError):
        scenario.apply(_tiny(), {"hub_id": "H1", "to": "Micro Hub"})  # untyped dataset


# ---- merge_zones -----------------------------------------------------------


def test_merge_zones_hand_math_on_the_tiny_fixture():
    scenario = registry.get(SCENARIO, "merge_zones")
    model = _tiny()
    # Z1 (30 @ cost 10 from H1) absorbs Z2 (20 @ cost 14 from H1):
    # merged run = 50 @ 10 = 500; Z3 stays 10 @ 12 = 120; total 620
    out = scenario.apply(model, {"absorbing_zone_id": "Z1", "merged_zone_id": "Z2"})

    assert [z.id for z in out.zones] == ["Z1", "Z3"]
    assert next(z for z in out.zones if z.id == "Z1").demand == 50.0
    assert out.demand["Z1"] == 50.0 and "Z2" not in out.demand
    assert not any(k[1] == "Z2" for k in out.od_matrix)
    flow = solve_min_cost_flow(out)
    assert flow.feasible
    assert flow.total_cost == 620.0
    # demand conserved network-wide: 30+20+10 before, 50+10 after
    assert sum(z.demand for z in out.zones) == sum(z.demand for z in model.zones)


def test_merge_zones_guardrails(real_model):
    scenario = registry.get(SCENARIO, "merge_zones")
    with pytest.raises(ValueError):  # cross-emirate
        scenario.apply(
            real_model,
            {"absorbing_zone_id": "Dubai-Al_Quoz-Standard", "merged_zone_id": "Sharjah-Industrial-Standard"},
        )
    with pytest.raises(ValueError):  # promise change (Standard vs Express)
        scenario.apply(
            real_model,
            {"absorbing_zone_id": "Dubai-Al_Quoz-Standard", "merged_zone_id": "Dubai-Al_Quoz-Express"},
        )
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"absorbing_zone_id": "Dubai-Al_Quoz-Standard", "merged_zone_id": "Dubai-Al_Quoz-Standard"})


def test_merge_zones_real_pair_reprices_the_run(real_model):
    scenario = registry.get(SCENARIO, "merge_zones")
    out = scenario.apply(
        real_model,
        {"absorbing_zone_id": "Dubai-Al_Quoz-Standard", "merged_zone_id": "Dubai-Business_Bay-Standard"},
    )
    assert next(z for z in out.zones if z.id == "Dubai-Al_Quoz-Standard").demand == pytest.approx(
        149.0 + 140.0
    )
    assert solve_min_cost_flow(out).feasible


# ---- change_fleet_mix (upgraded) + /network aggregates ---------------------


def test_fleet_mix_delta_and_validation(real_model):
    scenario = registry.get(SCENARIO, "change_fleet_mix")
    before = next(f for f in real_model.fleet_types if f.id == "HUB_DXB_01-Van")
    out = scenario.apply(real_model, {"fleet_type_id": "HUB_DXB_01-Van", "count_delta": 2})
    after = next(f for f in out.fleet_types if f.id == "HUB_DXB_01-Van")
    assert after.count_available == before.count_available + 2
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"fleet_type_id": "HUB_DXB_01-Van", "count_delta": -999})
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"fleet_type_id": "HUB_DXB_01-Van"})
    with pytest.raises(ValueError):
        scenario.apply(real_model, {"fleet_type_id": "NOPE", "count_delta": 1})


def test_network_exposes_engine_computed_fleet_aggregates():
    from fastapi.testclient import TestClient

    from hubris.api.main import app

    with TestClient(app) as client:  # boot = the real twin
        hubs = {h["id"]: h for h in client.get("/network").json()["hubs"]}
        fleet = client.get("/network").json()["fleet_types"]
        rows = [f for f in fleet if f["hub_id"] == "HUB_DXB_01"]
        expected_vehicles = sum(f["count_available"] for f in rows)
        expected_cost = round(sum(f["count_available"] * f["fixed_cost"] for f in rows), 2)
        expected_units = round(sum(f["count_available"] * f["capacity"] for f in rows), 1)

        hub = hubs["HUB_DXB_01"]
        assert hub["fleet_vehicles"] == expected_vehicles
        assert hub["fleet_daily_cost"] == pytest.approx(expected_cost, abs=0.02)
        assert hub["fleet_capacity_units"] == pytest.approx(expected_units, abs=0.2)
