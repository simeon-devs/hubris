"""Hand-checkable tests for T-23's prescriptive bottleneck unlock, reusing
test_flow.py's own hand-checked binding fixture (H1 capacity dropped to 40):
at capacity=40, total_cost=2700.0 (10 units of Z1 pushed onto H2 at
200/unit excess); at capacity=50 (2700's unlock target), total_cost drops
to 700.0 (the tiny fixture's own unconstrained baseline) — so the verified
savings must be exactly 2700.0 - 700.0 = 2000.0.
"""

from hubris.core.contracts import NetworkModel
from hubris.engine.bottleneck import (
    find_binding_hubs,
    find_cheapest_bottleneck_unlock,
    find_cheapest_feasibility_unlock,
)
from hubris.engine.flow import solve_min_cost_flow
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model_with_h1_capacity(capacity: float) -> NetworkModel:
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    for hub in raw.hubs:
        if hub["id"] == "H1":
            hub["capacity"] = capacity
    return NetworkModel.from_raw_tables(raw)


def _model_with_unserved_z3(z3_sla_hours: float = 0.25) -> NetworkModel:
    """The QComm crisis in miniature: H2 (capacity 5) is the ONLY hub that
    can reach Z3 (demand 10) inside its 15-minute promise — H1 is 100 min
    away — so 5 units/day cannot be served at all."""
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    for hub in raw.hubs:
        if hub["id"] == "H2":
            hub["capacity"] = 5.0
    for zone in raw.zones:
        if zone["id"] == "Z3":
            zone["sla_hours"] = z3_sla_hours
    return NetworkModel.from_raw_tables(raw)


def test_find_binding_hubs_flags_only_the_saturated_hub():
    model = _model_with_h1_capacity(40.0)
    flow = solve_min_cost_flow(model)

    assert find_binding_hubs(model, flow) == ["H1"]


def test_find_binding_hubs_empty_when_unconstrained():
    model = _model_with_h1_capacity(100.0)
    flow = solve_min_cost_flow(model)

    assert find_binding_hubs(model, flow) == []


def test_find_cheapest_bottleneck_unlock_matches_hand_computed_savings():
    model = _model_with_h1_capacity(40.0)

    result = find_cheapest_bottleneck_unlock(model)

    assert result["bottleneck_found"] is True
    rec = result["recommendation"]
    assert rec["hub_id"] == "H1"
    assert rec["unlock_units"] == 10.0  # exactly the 10 units of Z1 pushed onto H2
    assert rec["new_capacity"] == 50.0
    assert rec["verified_cost_savings"] == 2000.0  # 2700.0 (bound) - 700.0 (unconstrained)
    assert rec["unlocked_zone_ids"] == ["Z1"]
    assert "H1" in result["why"]
    assert "2000.0" in result["why"]


def test_find_cheapest_bottleneck_unlock_reports_nothing_when_unconstrained():
    model = _model_with_h1_capacity(100.0)

    result = find_cheapest_bottleneck_unlock(model)

    assert result["bottleneck_found"] is False
    assert "binding" in result["reason"].lower()


def test_feasibility_unlock_fixes_the_hub_that_can_actually_reach_the_unserved_zone():
    """Hand-checked: Z3 demands 10, only H2 (capacity 5) can reach it in
    time, so 5/day are unserved. The fix is +5 at H2 -> capacity 10.
    Transport cost RISES by exactly 5 x 12.0 = 60.0 (H2->Z3 costs 12/unit):
    serving previously-dropped parcels is a cost, never a saving."""
    model = _model_with_unserved_z3()
    flow = solve_min_cost_flow(model)
    assert flow.unmet_demand == {"Z3": 5.0}

    result = find_cheapest_feasibility_unlock(model, flow)

    assert result["bottleneck_found"] is True
    assert result["kind"] == "restore_feasibility"
    rec = result["recommendation"]
    assert rec["hub_id"] == "H2"  # H1 is 100 min away — capacity there fixes nothing
    assert rec["unlock_units"] == 5.0
    assert rec["new_capacity"] == 10.0
    assert rec["unmet_cleared"] == 5.0
    assert rec["unmet_remaining"] == 0.0
    assert rec["served_zone_ids"] == ["Z3"]
    assert rec["added_transport_cost"] == 60.0
    assert "verified_cost_savings" not in rec  # would be a lie: this fix costs money
    assert [c["hub_id"] for c in result["all_candidates"]] == ["H2"]


def test_unserved_demand_outranks_a_cheaper_reroute_elsewhere():
    """The regression this whole change exists for: with demand unserved,
    the recommendation must be the feasibility fix, not a cost saving in
    some other emirate (the alert card said Abu Dhabi, recommended Dubai)."""
    model = _model_with_unserved_z3()

    result = find_cheapest_bottleneck_unlock(model)

    assert result["kind"] == "restore_feasibility"
    assert result["recommendation"]["hub_id"] == "H2"
    assert "cannot be served at all" in result["why"]


def test_feasibility_unlock_says_so_when_no_facility_can_reach_the_zone():
    """A 5-minute promise nothing can reach: more capacity cannot fix it,
    and the engine says that plainly instead of naming an unrelated hub."""
    model = _model_with_unserved_z3(z3_sla_hours=5 / 60)

    result = find_cheapest_bottleneck_unlock(model)

    assert result["bottleneck_found"] is False
    assert "new site" in result["reason"]
    assert result["unmet_demand"] == {"Z3": 10.0}


def test_feasibility_unlock_declines_a_healthy_network():
    result = find_cheapest_feasibility_unlock(_model_with_h1_capacity(100.0))

    assert result["bottleneck_found"] is False
    assert "no unserved demand" in result["reason"].lower()
