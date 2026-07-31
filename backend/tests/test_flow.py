"""Hand-checkable tests for the min-cost flow assignment + duals (T-08),
using the tiny 2-hub/3-zone fixture.

Unconstrained (both hubs capacity=100, plenty of room): each zone should go
to its cheapest hub — Z1,Z2->H1 (10,14), Z3->H2 (12) — total_cost=700, and
since no hub capacity binds, both hub duals are ~0 while each zone's dual
equals the cost of its cheapest edge (the marginal cost of serving one more
unit there, with nothing else constraining the problem).

Constrained (H1 capacity dropped to 40, forcing 10 units of Z1 off H1):
solved once at capacity=40 and once at capacity=41 to empirically verify
the H1 capacity dual against the real cost delta, rather than trusting a
hand-derived sign convention — LP sensitivity (envelope theorem) says the
dual IS that delta, so this is itself the hand-check.
"""

from hubris.core.contracts import NetworkModel
from hubris.core.models import RawTables
from hubris.engine.flow import OVERFLOW_PENALTY, solve_min_cost_flow
from tests.fixtures.tiny_network import TINY_RAW_TABLES


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


def _model_with_h1_capacity(capacity: float) -> NetworkModel:
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    for hub in raw.hubs:
        if hub["id"] == "H1":
            hub["capacity"] = capacity
    return NetworkModel.from_raw_tables(raw)


def test_unconstrained_flow_picks_cheapest_hub_per_zone():
    model = _model_with_h1_capacity(100.0)
    result = solve_min_cost_flow(model)

    assert result.feasible
    assert result.unmet_demand == {}
    assert result.flows == {"H1": {"Z1": 30.0, "Z2": 20.0}, "H2": {"Z3": 10.0}}
    assert result.total_cost == 700.0

    # No hub capacity binds -> both hub duals are ~0.
    assert abs(result.hub_duals["H1"]) < 1e-6
    assert abs(result.hub_duals["H2"]) < 1e-6
    # Each zone's dual = its cheapest available edge cost, since nothing
    # else is constraining the problem.
    assert result.zone_duals == {"Z1": 10.0, "Z2": 14.0, "Z3": 12.0}


def test_binding_hub_capacity_forces_reassignment_and_produces_a_dual():
    model = _model_with_h1_capacity(40.0)
    result = solve_min_cost_flow(model)

    assert result.feasible
    # H1 is full; the cheapest way to shed 10 units is moving Z1 (not Z2) to
    # H2, since 200/unit (Z1's H1->H2 cost jump) beats 206/unit (Z2's).
    assert result.flows == {"H1": {"Z1": 20.0, "Z2": 20.0}, "H2": {"Z1": 10.0, "Z3": 10.0}}
    assert sum(result.flows["H1"].values()) == 40.0  # H1 fully utilized
    assert result.total_cost == 2700.0

    assert result.hub_duals["H1"] != 0.0
    assert abs(result.hub_duals["H2"]) < 1e-6  # H2 has slack -> not binding


def test_hub_capacity_dual_matches_the_real_cost_of_relaxing_it():
    # LP sensitivity: the shadow price of a binding constraint IS the change
    # in the objective per unit change in its RHS. Verify that directly by
    # re-solving with one more unit of H1 capacity, instead of trusting a
    # remembered sign convention.
    at_40 = solve_min_cost_flow(_model_with_h1_capacity(40.0))
    at_41 = solve_min_cost_flow(_model_with_h1_capacity(41.0))

    delta = at_40.total_cost - at_41.total_cost
    assert delta == 200.0
    assert abs(abs(at_40.hub_duals["H1"]) - delta) < 1e-6


def test_always_solves_even_when_total_capacity_is_below_total_demand():
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    for hub in raw.hubs:
        hub["capacity"] = 10.0  # 20 total, well under 60 total demand
    model = NetworkModel.from_raw_tables(raw)

    result = solve_min_cost_flow(model)  # must not raise or hang

    assert result.feasible is False
    assert sum(result.unmet_demand.values()) == 40.0  # 60 demand - 20 capacity placed
    placed = sum(v for flows in result.flows.values() for v in flows.values())
    assert placed == 20.0


def test_sla_excludes_edges_that_would_arrive_too_late():
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    for zone in raw.zones:
        if zone["id"] == "Z3":
            zone["sla_hours"] = 0.01  # 0.6 minutes — both H1 (100min) and H2 (12min) miss it

    model = NetworkModel.from_raw_tables(raw)
    result = solve_min_cost_flow(model)

    assert result.unmet_demand == {"Z3": 10.0}


def test_overflow_penalty_prefers_an_expensive_real_route_over_reporting_unmet():
    # cost=500,000/unit is half the overflow penalty (1,000,000) — a huge
    # real-world cost by this domain's standards (typical edges are tens to
    # low hundreds per unit), but still strictly cheaper than the overflow
    # slack. The solver must route real demand through it rather than
    # reporting it as unmet — proving the penalty can't be "cheated" by
    # dumping expensive-but-serviceable demand into overflow.
    assert 500_000.0 < OVERFLOW_PENALTY
    model = _single_edge_model(capacity=10.0, cost=500_000.0, demand=10.0)

    result = solve_min_cost_flow(model)

    assert result.feasible is True
    assert result.unmet_demand == {}
    assert result.flows == {"H1": {"Z1": 10.0}}
    assert result.total_cost == 5_000_000.0  # 10 units x 500,000/unit, a real (if painful) cost


def test_overflow_penalty_still_flags_genuine_infeasibility_not_silently_absorbed():
    # Same edge, but capacity can only cover half the demand — no route,
    # however expensive, can place the other half. That shortfall must
    # surface as unmet_demand/feasible=False, not be silently dropped or
    # misreported as a fully-served result.
    model = _single_edge_model(capacity=5.0, cost=500_000.0, demand=10.0)

    result = solve_min_cost_flow(model)

    assert result.feasible is False
    assert result.unmet_demand == {"Z1": 5.0}
    assert result.flows == {"H1": {"Z1": 5.0}}  # the 5 units that DO fit still route for real
    assert result.total_cost == 2_500_000.0  # only the 5 real units are costed; overflow isn't
    assert "Z3" not in result.flows.get("H1", {})
    assert "Z3" not in result.flows.get("H2", {})
