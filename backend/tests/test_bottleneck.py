"""Hand-checkable tests for T-23's prescriptive bottleneck unlock, reusing
test_flow.py's own hand-checked binding fixture (H1 capacity dropped to 40):
at capacity=40, total_cost=2700.0 (10 units of Z1 pushed onto H2 at
200/unit excess); at capacity=50 (2700's unlock target), total_cost drops
to 700.0 (the tiny fixture's own unconstrained baseline) — so the verified
savings must be exactly 2700.0 - 700.0 = 2000.0.
"""

from hubris.core.contracts import NetworkModel
from hubris.engine.bottleneck import find_binding_hubs, find_cheapest_bottleneck_unlock
from hubris.engine.flow import solve_min_cost_flow
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model_with_h1_capacity(capacity: float) -> NetworkModel:
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    for hub in raw.hubs:
        if hub["id"] == "H1":
            hub["capacity"] = capacity
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
