"""Hand-checkable tests for T-22's threshold/break-even finder, using the
tiny 2-hub/3-zone fixture.

H1's assigned zones (per TINY_RAW_TABLES.current_assignments' dominant
hub) are Z1 (30) + Z2 (20) = 50, against H1's capacity of 100 -> the true
break-even growth factor is exactly 100/50 = 2.0. Binary search (tolerance
0.01) should converge just above that.
"""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.agents.threshold_finder import find_customer_count_break, find_demand_growth_break
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model_with_h1_capacity(capacity: float) -> NetworkModel:
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    for hub in raw.hubs:
        if hub["id"] == "H1":
            hub["capacity"] = capacity
    return NetworkModel.from_raw_tables(raw)


def test_find_demand_growth_break_converges_near_the_hand_computed_breakeven():
    model = _model_with_h1_capacity(100.0)

    result = find_demand_growth_break(model, hub_id="H1")

    assert result["threshold_found"] is True
    assert result["already_broken_at_current_demand"] is False
    assert 1.99 <= result["growth_factor_threshold"] <= 2.02  # true breakeven is exactly 2.0
    assert result["hub_dual"] != 0.0
    assert result["hub_utilization_pct"] == 100.0
    assert result["unmet_demand"] == {}  # H2 absorbs the overflow, nothing goes truly unmet


def test_find_demand_growth_break_flags_a_hub_already_binding_at_current_demand():
    # H1's capacity (40) is already below its assigned 50 -> binding at
    # factor 1.0, no search needed (mirrors test_flow.py's own binding
    # fixture).
    model = _model_with_h1_capacity(40.0)

    result = find_demand_growth_break(model, hub_id="H1")

    assert result["threshold_found"] is True
    assert result["already_broken_at_current_demand"] is True
    assert result["growth_factor_threshold"] == 1.0


def test_find_demand_growth_break_reports_not_found_within_a_small_search_range():
    # H1 has ample capacity (10,000) relative to its 50 assigned demand ->
    # never binds within a deliberately tiny search ceiling.
    model = _model_with_h1_capacity(10_000.0)

    result = find_demand_growth_break(model, hub_id="H1", max_growth_factor=2.0)

    assert result["threshold_found"] is False
    assert result["searched_up_to_growth_factor"] >= 2.0


def test_find_demand_growth_break_raises_for_an_unknown_hub():
    model = _model_with_h1_capacity(100.0)
    with pytest.raises(ValueError):
        find_demand_growth_break(model, hub_id="H999")


def test_find_demand_growth_break_reports_no_assigned_demand_cleanly():
    # No zone is currently assigned to H2 in this hand-built variant ->
    # nothing to grow, should report cleanly rather than search blindly.
    raw = TINY_RAW_TABLES.model_copy(deep=True)
    raw.current_assignments = [
        {"zone_id": "Z1", "hub_id": "H1", "volume": 30.0},
        {"zone_id": "Z2", "hub_id": "H1", "volume": 20.0},
        {"zone_id": "Z3", "hub_id": "H1", "volume": 10.0},
    ]
    model = NetworkModel.from_raw_tables(raw)

    result = find_demand_growth_break(model, hub_id="H2")

    assert result["threshold_found"] is False
    assert "no assigned demand" in result["reason"]


def test_find_customer_count_break_matches_hand_computed_threshold():
    # Dubai's representative customer profile is (Z1+Z2)/2 = 25.0 demand,
    # sla_hours=24.0 (both Dubai zones share it). Total network capacity is
    # 200 against a 60 baseline demand -> headroom of 140, so the 6th
    # customer (150 added demand) is the first to overflow: 60+150=210 > 200.
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)

    result = find_customer_count_break(model, emirate="Dubai")

    assert result["threshold_found"] is True
    assert result["already_broken_at_current_demand"] is False
    assert result["customer_count_threshold"] == 6
    assert result["representative_customer_profile"] == {"demand": 25.0, "sla_hours": 24.0}
    assert result["unmet_demand_at_threshold"]  # some real shortfall reported
    assert result["served_pct_at_threshold"] < 100.0


def test_find_customer_count_break_reports_not_found_within_a_small_search_range():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)

    result = find_customer_count_break(model, emirate="Dubai", max_customer_count=2)

    assert result["threshold_found"] is False
    assert result["searched_up_to_customer_count"] >= 2
