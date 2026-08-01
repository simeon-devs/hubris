"""Hand-checkable tests for T-20's Monte Carlo robustness band.

Single-edge fixtures (mirroring test_flow.py's `_single_edge_model`) keep
the cost-per-unit trivially known, so the percentile band can be reasoned
about directly instead of just asserting "it ran."
"""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.core.models import RawTables
from hubris.engine.monte_carlo import compute_robustness_band


def _single_edge_model(capacity: float, cost: float, demand: float = 10.0) -> NetworkModel:
    raw = RawTables(
        hubs=[
            {
                "id": "H1",
                "name": "Hub One",
                "lat": 25.2,
                "lon": 55.3,
                "emirate": "Dubai",
                "capacity": capacity,
                "fixed_cost": 0.0,
                "handling_cost": 0.0,
                "status": "open",
            }
        ],
        zones=[
            {
                "id": "Z1",
                "name": "Zone One",
                "lat": 25.1,
                "lon": 55.2,
                "emirate": "Dubai",
                "demand": demand,
                "sla_hours": 24.0,
            }
        ],
        fleet_types=[],
        od_matrix=[
            {"from_id": "H1", "to_id": "Z1", "distance_km": 1.0, "time_min": 1.0, "cost": cost}
        ],
        current_assignments=[],
    )
    return NetworkModel.from_raw_tables(raw)


def test_zero_variation_collapses_the_band_to_the_exact_base_cost():
    # A single edge -> cost-per-parcel is always exactly `cost`, regardless
    # of demand, as long as it's fully served. With 0% variation every
    # trial perturbs demand by exactly x1.0, so the whole "band" collapses
    # to one point.
    model = _single_edge_model(capacity=100.0, cost=15.0, demand=10.0)

    band = compute_robustness_band(model, demand_variation_pct=0.0, trials=5, seed=42)

    assert band.cost_to_serve_p10 == 15.0
    assert band.cost_to_serve_p50 == 15.0
    assert band.cost_to_serve_p90 == 15.0
    assert band.feasible_pct == 100.0
    assert band.holds_under_variation is True


def test_ample_capacity_holds_under_20pct_demand_variation():
    # Capacity (100) is 10x the base demand (10) -> even the worst-case
    # +20% trial (demand=12) can never exceed capacity, so every trial
    # must be feasible regardless of the random draw.
    model = _single_edge_model(capacity=100.0, cost=20.0, demand=10.0)

    band = compute_robustness_band(model, demand_variation_pct=20.0, trials=50, seed=42)

    assert band.feasible_pct == 100.0
    assert band.holds_under_variation is True
    # cost-per-parcel is ~20.0 in every trial (single edge, fully served) -
    # the tiny spread is just flow.total_cost's 2dp rounding, not real
    # variation -> the band is a near-point even though demand itself varied.
    assert band.cost_to_serve_p10 == pytest.approx(20.0, abs=0.001)
    assert band.cost_to_serve_p90 == pytest.approx(20.0, abs=0.001)


def test_tight_capacity_is_flagged_as_not_holding_under_variation():
    # Capacity exactly equals base demand (10.0) -> any trial where the
    # random factor pushes demand above 1.0x must overflow, so this
    # configuration cannot hold under +/-20% demand variation.
    model = _single_edge_model(capacity=10.0, cost=20.0, demand=10.0)

    band = compute_robustness_band(model, demand_variation_pct=20.0, trials=50, seed=42)

    assert band.holds_under_variation is False
    assert 0.0 < band.feasible_pct < 100.0  # roughly half the draws land above 1.0x


def test_same_seed_is_deterministic():
    model = _single_edge_model(capacity=100.0, cost=20.0, demand=10.0)

    band_a = compute_robustness_band(model, demand_variation_pct=20.0, trials=30, seed=7)
    band_b = compute_robustness_band(model, demand_variation_pct=20.0, trials=30, seed=7)

    assert band_a == band_b


def test_higher_variation_widens_or_holds_the_percentile_spread():
    # Two edges at different costs (cheap H1->Z1, no alternative for Z2) so
    # demand perturbation can shift which edges are binding; a wider demand
    # range should never produce a *narrower* p10-p90 spread than a tighter one.
    raw = RawTables(
        hubs=[
            {
                "id": "H1",
                "name": "Hub One",
                "lat": 25.2,
                "lon": 55.3,
                "emirate": "Dubai",
                "capacity": 12.0,
                "fixed_cost": 0.0,
                "handling_cost": 0.0,
                "status": "open",
            }
        ],
        zones=[
            {
                "id": "Z1",
                "name": "Zone One",
                "lat": 25.1,
                "lon": 55.2,
                "emirate": "Dubai",
                "demand": 10.0,
                "sla_hours": 24.0,
            }
        ],
        fleet_types=[],
        od_matrix=[
            {"from_id": "H1", "to_id": "Z1", "distance_km": 1.0, "time_min": 1.0, "cost": 20.0}
        ],
        current_assignments=[],
    )
    model = NetworkModel.from_raw_tables(raw)

    narrow = compute_robustness_band(model, demand_variation_pct=5.0, trials=50, seed=42)
    wide = compute_robustness_band(model, demand_variation_pct=30.0, trials=50, seed=42)

    assert wide.feasible_pct <= narrow.feasible_pct
