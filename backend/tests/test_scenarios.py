"""Hand-checkable tests for T-10's 6 scenario modules, using the tiny
2-hub/3-zone fixture. Every test also proves the "never mutate the input"
contract: the original model's values must be unchanged after `apply()`."""

from hubris.core.contracts import NetworkModel
from hubris.plugins.scenarios.add_customer import AddCustomerScenario
from hubris.plugins.scenarios.add_hub import AddHubScenario
from hubris.plugins.scenarios.change_fleet_mix import ChangeFleetMixScenario
from hubris.plugins.scenarios.close_hub import CloseHubScenario
from hubris.plugins.scenarios.demand_scale import DemandScaleScenario
from hubris.plugins.scenarios.move_hub import MoveHubScenario
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def test_move_hub_recomputes_od_and_does_not_mutate_original():
    model = _model()
    original_h1_cost_z1 = model.od_matrix[("H1", "Z1")].cost

    result = MoveHubScenario().apply(model, {"hub_id": "H1", "new_lat": 24.45, "new_lon": 54.4})

    moved_h1 = next(h for h in result.hubs if h.id == "H1")
    assert (moved_h1.lat, moved_h1.lon) == (24.45, 54.4)
    assert result.od_matrix[("H1", "Z1")].cost != original_h1_cost_z1

    # original untouched
    original_h1 = next(h for h in model.hubs if h.id == "H1")
    assert (original_h1.lat, original_h1.lon) == (25.2, 55.3)
    assert model.od_matrix[("H1", "Z1")].cost == original_h1_cost_z1


def test_close_hub_flips_status_and_does_not_mutate_original():
    model = _model()
    result = CloseHubScenario().apply(model, {"hub_id": "H2"})

    assert next(h for h in result.hubs if h.id == "H2").status == "closed"
    assert next(h for h in model.hubs if h.id == "H2").status == "open"


def test_add_hub_extends_od_matrix_and_does_not_mutate_original():
    model = _model()
    result = AddHubScenario().apply(
        model,
        {
            "id": "H3",
            "name": "Hub Three",
            "lat": 25.0,
            "lon": 55.0,
            "emirate": "Sharjah",
            "capacity": 100.0,
            "fixed_cost": 800.0,
            "handling_cost": 2.0,
        },
    )

    assert len(result.hubs) == 3
    assert len(result.od_matrix) == 3 * 3  # 3 hubs x 3 zones
    assert ("H3", "Z1") in result.od_matrix
    assert ("H3", "Z2") in result.od_matrix
    assert ("H3", "Z3") in result.od_matrix

    # original untouched
    assert len(model.hubs) == 2
    assert len(model.od_matrix) == 2 * 3


def test_change_fleet_mix_updates_count_and_does_not_mutate_original():
    model = _model()
    result = ChangeFleetMixScenario().apply(model, {"fleet_type_id": "F1", "count_available": 10})

    assert next(f for f in result.fleet_types if f.id == "F1").count_available == 10
    assert next(f for f in model.fleet_types if f.id == "F1").count_available == 5


def test_add_customer_extends_zones_and_od_matrix_and_does_not_mutate_original():
    model = _model()
    result = AddCustomerScenario().apply(
        model,
        {
            "id": "Z4",
            "name": "Zone Four",
            "lat": 25.15,
            "lon": 55.25,
            "emirate": "Dubai",
            "demand": 15.0,
        },
    )

    assert len(result.zones) == 4
    assert result.demand["Z4"] == 15.0
    assert ("H1", "Z4") in result.od_matrix
    assert ("H2", "Z4") in result.od_matrix

    # original untouched
    assert len(model.zones) == 3
    assert "Z4" not in model.demand
    assert ("H1", "Z4") not in model.od_matrix


def test_demand_scale_network_wide_and_does_not_mutate_original():
    model = _model()
    result = DemandScaleScenario().apply(model, {"factor": 1.2})

    result_demand = {z.id: z.demand for z in result.zones}
    assert result_demand == {"Z1": 36.0, "Z2": 24.0, "Z3": 12.0}
    assert result.demand == {"Z1": 36.0, "Z2": 24.0, "Z3": 12.0}

    original_demand = {z.id: z.demand for z in model.zones}
    assert original_demand == {"Z1": 30.0, "Z2": 20.0, "Z3": 10.0}
    assert model.demand == {"Z1": 30.0, "Z2": 20.0, "Z3": 10.0}


def test_demand_scale_scoped_to_one_emirate():
    model = _model()
    result = DemandScaleScenario().apply(model, {"factor": 2.0, "emirate": "Dubai"})

    result_demand = {z.id: z.demand for z in result.zones}
    # Z1, Z2 are Dubai; Z3 is Abu Dhabi and must be untouched.
    assert result_demand == {"Z1": 60.0, "Z2": 40.0, "Z3": 10.0}

    original_demand = {z.id: z.demand for z in model.zones}
    assert original_demand == {"Z1": 30.0, "Z2": 20.0, "Z3": 10.0}


def test_all_nine_scenarios_are_registered_and_agent_usable():
    from hubris.core.registry import SCENARIO, load_plugins
    from hubris.core.registry import registry as global_registry

    load_plugins()
    registered_names = {s.name for s in global_registry.all(SCENARIO)}
    assert registered_names == {
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
        "convert_hub_type",
        "merge_zones",
    }

    tools = global_registry.as_agent_tools()
    tool = next(t for t in tools if t.name == "scenario_close_hub")
    result = tool.run(model=_model(), params={"hub_id": "H2"})
    hub_by_id = {h["id"]: h for h in result["hubs"]}
    assert hub_by_id["H2"]["status"] == "closed"
