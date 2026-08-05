"""Hand-checkable tests for the route-cost engine function and its endpoint
(CLAUDE.md §7), using the tiny 2-hub/3-zone fixture.

Fixture facts used below (tests/fixtures/tiny_network.py):
  H1→Z1 OD row: distance_km=5.0, time_min=10.0, cost=10.0
  H1.handling_cost = 2.0
  F1 "Van": capacity=50, cost_per_km=1.5, fixed_cost=100

Van maths for H1→Z1 (each figure derivable by hand):
  variable_cost           = 5.0 km × 1.5 AED/km          = 7.5
  trip_cost               = 7.5 + 100 vehicle fixed      = 107.5
  transport per parcel    = 107.5 / 50 capacity          = 2.15
  cost_per_parcel         = 2.15 + 2.0 handling          = 4.15
"""

import pytest
from fastapi.testclient import TestClient

from hubris.api.main import app
from hubris.core.contracts import NetworkModel
from hubris.core.models import FleetType
from hubris.engine.route_cost import compute_route_cost
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def test_hand_checked_van_costs_for_h1_z1():
    result = compute_route_cost(_model(), "H1", "Z1")

    assert result["from_hub"] == "H1"
    assert result["to_zone"] == "Z1"
    # Canonical engine figures pass straight through from the OD matrix.
    assert result["distance_km"] == 5.0
    assert result["time_min"] == 10.0
    assert result["od_cost_per_parcel"] == 10.0
    assert result["handling_cost_per_parcel"] == 2.0

    van = result["modes"][0]
    assert van["fleet_id"] == "F1"
    assert van["fleet_name"] == "Van"
    assert van["variable_cost"] == 7.5
    assert van["trip_cost"] == 107.5
    assert van["cost_per_parcel"] == 4.15


def test_reports_one_entry_per_fleet_type_sorted_cheapest_first():
    model = _model()
    # A second, cheaper-per-parcel fleet: big truck.
    #   variable = 5.0 × 3.0 = 15.0; trip = 15 + 300 = 315
    #   per parcel = 315 / 400 = 0.7875 → 0.79 + 2.0 handling = 2.79
    model.fleet_types.append(
        FleetType(
            id="F9",
            name="Big Truck",
            capacity=400.0,
            cost_per_km=3.0,
            fixed_cost=300.0,
            count_available=2,
        )
    )
    result = compute_route_cost(model, "H1", "Z1")

    assert [m["fleet_id"] for m in result["modes"]] == ["F9", "F1"]  # cheapest first
    assert result["modes"][0]["cost_per_parcel"] == 2.79


def test_unknown_hub_raises_key_error():
    with pytest.raises(KeyError):
        compute_route_cost(_model(), "NOPE", "Z1")


def test_missing_od_pair_raises_key_error():
    model = _model()
    del model.od_matrix[("H1", "Z1")]
    with pytest.raises(KeyError):
        compute_route_cost(model, "H1", "Z1")


def _pin_synthetic_baseline():
    # Boot seeds the REAL twin (T-30 re-seed); these endpoint tests are
    # hand-checked on the synthetic fixture, so pin it explicitly.
    from hubris.api.state import state as app_state
    from hubris.core.contracts import NetworkModel
    from hubris.data.synthetic import generate_synthetic_raw_tables

    app_state.reset_baseline(NetworkModel.from_raw_tables(generate_synthetic_raw_tables()))


def test_endpoint_returns_engine_figures():
    with TestClient(app) as client:
        _pin_synthetic_baseline()
        response = client.get("/route-cost", params={"from_hub": "H1", "to_zone": "Z1"})
    assert response.status_code == 200
    body = response.json()
    # Same synthetic baseline the rest of the API serves — spot-check shape
    # and that every mode carries the transparent breakdown.
    assert body["from_hub"] == "H1"
    assert body["to_zone"] == "Z1"
    assert body["distance_km"] > 0
    assert len(body["modes"]) == 4  # Bike, Van, Small Truck, Truck
    for mode in body["modes"]:
        assert mode["cost_per_parcel"] == round(
            round(mode["trip_cost"] / mode["vehicle_capacity"], 4)
            + body["handling_cost_per_parcel"],
            2,
        )


def test_endpoint_404s_on_unknown_pair():
    with TestClient(app) as client:
        _pin_synthetic_baseline()
        response = client.get("/route-cost", params={"from_hub": "NOPE", "to_zone": "Z1"})
    assert response.status_code == 404
