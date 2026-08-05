"""absorb_hub — close a micro and MOVE its capacity + roster into a
sibling (vs close_hub, where capacity disappears). Tiny-fixture maths is
hand-checkable; the real-twin test asserts the default-absorber MECHANISM
(nearest open Full Hub) rather than a hardcoded winner."""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.core.registry import SCENARIO, load_plugins, registry
from hubris.engine.flow import solve_min_cost_flow
from hubris.engine.geo import road_distance_km
from hubris.ingestion.dataset_g_connector import DatasetGConnector
from tests.fixtures.tiny_network import TINY_RAW_TABLES

REAL_FILE = "hubris/data/dataset_g.xlsx"


@pytest.fixture(scope="module")
def scenario():
    load_plugins()
    return registry.get(SCENARIO, "absorb_hub")


@pytest.fixture(scope="module")
def real_model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(DatasetGConnector().load(REAL_FILE, network="hub_spoke"))


def _tiny() -> NetworkModel:
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES.model_copy(deep=True))


def test_absorb_moves_capacity_and_closes_the_micro(scenario):
    model = _tiny()  # H1 and H2, 100 capacity each
    out = scenario.apply(model, {"micro_id": "H2", "into_id": "H1"})

    h1 = next(h for h in out.hubs if h.id == "H1")
    h2 = next(h for h in out.hubs if h.id == "H2")
    assert h2.status == "closed"
    assert h1.capacity == 200.0  # 100 own + 100 absorbed — capacity MOVED, not lost
    # input model untouched (contract: modified COPY)
    assert next(h for h in model.hubs if h.id == "H1").capacity == 100.0
    assert next(h for h in model.hubs if h.id == "H2").status == "open"
    # the network still serves everything: H1 (200) covers total demand 60
    flow = solve_min_cost_flow(out)
    assert flow.feasible


def test_absorb_validates_its_inputs(scenario):
    model = _tiny()
    with pytest.raises(ValueError):
        scenario.apply(model, {"micro_id": "NOPE"})
    with pytest.raises(ValueError):
        scenario.apply(model, {"micro_id": "H2", "into_id": "H2"})
    with pytest.raises(ValueError):
        scenario.apply(model, {"micro_id": "H2", "into_id": "NOPE"})
    closed_first = scenario.apply(model, {"micro_id": "H2", "into_id": "H1"})
    with pytest.raises(ValueError):
        scenario.apply(closed_first, {"micro_id": "H2"})  # already closed


def test_default_absorber_is_the_nearest_open_full_hub(scenario, real_model):
    micro = next(h for h in real_model.hubs if h.id == "HUB_RAK_01")
    fulls = [
        h
        for h in real_model.hubs
        if h.status == "open" and h.hub_type == "Full Hub" and h.id != micro.id
    ]
    expected = min(fulls, key=lambda h: road_distance_km(micro.lat, micro.lon, h.lat, h.lon))

    out = scenario.apply(real_model, {"micro_id": "HUB_RAK_01"})

    into_after = next(h for h in out.hubs if h.id == expected.id)
    assert next(h for h in out.hubs if h.id == "HUB_RAK_01").status == "closed"
    assert into_after.capacity == pytest.approx(expected.capacity + micro.capacity, abs=0.01)
    # never absorbed by another micro
    assert into_after.hub_type == "Full Hub"


def test_absorb_moves_the_rider_roster_with_the_people(scenario, real_model):
    micro = next(h for h in real_model.hubs if h.id == "HUB_RAK_01")
    out = scenario.apply(real_model, {"micro_id": "HUB_RAK_01", "into_id": "HUB_SHJ_01"})
    before = next(h for h in real_model.hubs if h.id == "HUB_SHJ_01")
    after = next(h for h in out.hubs if h.id == "HUB_SHJ_01")

    assert after.riders_fte == (before.riders_fte or 0) + (micro.riders_fte or 0)
    assert after.riders_ftc == (before.riders_ftc or 0) + (micro.riders_ftc or 0)
    assert after.rider_capacity_daily == pytest.approx(
        (before.rider_capacity_daily or 0) + (micro.rider_capacity_daily or 0), abs=0.2
    )
    assert after.rider_weekly_cost == pytest.approx(
        (before.rider_weekly_cost or 0) + (micro.rider_weekly_cost or 0), abs=0.02
    )
