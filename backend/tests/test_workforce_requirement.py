"""Hand-checkable tests for the Forecast-to-Workforce metric, using the tiny
2-hub/3-zone fixture (CLAUDE.md §7).

Every expected number below is derived in the comment beside it, so the
arithmetic can be checked without running anything.

One courier clears PARCELS_PER_COURIER_HOUR * PRODUCTIVE_HOURS_PER_SHIFT
= 18.0 * 7.5 = 135 parcels per shift.
"""

from hubris.core.contracts import NetworkModel
from hubris.plugins.metrics.workforce_requirement import (
    PARCELS_PER_COURIER_SHIFT,
    WorkforceRequirementMetric,
    _classify,
    _headcount_for,
    _sustainable_headcount,
)
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def test_shift_capacity_is_the_documented_product():
    assert PARCELS_PER_COURIER_SHIFT == 135.0


def test_headcount_rounds_up_because_couriers_are_indivisible():
    assert _headcount_for(0) == 0
    assert _headcount_for(1) == 1  # any volume at all needs someone
    assert _headcount_for(135) == 1  # exactly one full shift
    assert _headcount_for(136) == 2  # one parcel over -> a second courier


def test_sustainable_headcount_rounds_down_because_half_a_courier_serves_nobody():
    assert _sustainable_headcount(0) == 0
    assert _sustainable_headcount(134) == 0  # cannot sustain even one
    assert _sustainable_headcount(270) == 2  # exactly two full shifts


def test_classify_respects_the_one_courier_tolerance():
    assert _classify(2) == "understaffed"
    assert _classify(1) == "balanced"  # within tolerance
    assert _classify(-1) == "balanced"
    assert _classify(-2) == "overstaffed"


def test_tiny_network_per_hub_headcount_is_hand_checkable():
    result = WorkforceRequirementMetric().compute(_model(), None)
    per_hub = result.breakdown["per_hub"]

    # H1 takes Z1 (30, dominant hub) + Z2 (20) = 50 parcels.
    #   required    = ceil(50 / 135)  = 1
    #   sustainable = floor(100 / 135) = 0   (capacity 100)
    assert per_hub["H1"]["assigned_parcels"] == 50.0
    assert per_hub["H1"]["required_headcount"] == 1
    assert per_hub["H1"]["sustainable_headcount"] == 0
    assert per_hub["H1"]["gap"] == 1
    assert per_hub["H1"]["gap_direction"] == "balanced"  # gap of 1 is within tolerance

    # H2 takes Z3 only = 10 parcels.
    #   required    = ceil(10 / 135)  = 1
    #   sustainable = floor(100 / 135) = 0
    assert per_hub["H2"]["assigned_parcels"] == 10.0
    assert per_hub["H2"]["required_headcount"] == 1
    assert per_hub["H2"]["gap"] == 1

    # Network total = 1 + 1 = 2 couriers.
    assert result.value == 2
    assert result.unit == "couriers"


def test_courier_hours_are_reported_alongside_headcount():
    per_hub = WorkforceRequirementMetric().compute(_model(), None).breakdown["per_hub"]
    # 50 parcels / 18 parcels-per-hour = 2.78 courier-hours.
    assert per_hub["H1"]["required_courier_hours"] == 2.78


def test_demand_spike_flips_a_hub_to_understaffed():
    """The demo beat: baseline is healthy, a spike turns the pillar red."""
    model = _model()
    assert (
        WorkforceRequirementMetric().compute(model, None).breakdown["per_hub"]["H1"][
            "gap_direction"
        ]
        == "balanced"
    )

    # H1 serves Z1 + Z2. Push Z1 to 200 -> assigned = 220 parcels.
    #   required    = ceil(220 / 135) = 2
    #   sustainable = floor(100 / 135) = 0  -> gap 2 -> understaffed
    model.demand["Z1"] = 200.0
    spiked = WorkforceRequirementMetric().compute(model, None).breakdown["per_hub"]["H1"]
    assert spiked["required_headcount"] == 2
    assert spiked["gap"] == 2
    assert spiked["gap_direction"] == "understaffed"


def test_closed_hub_sustains_nobody():
    model = _model()
    model.hubs[0].status = "closed"
    per_hub = WorkforceRequirementMetric().compute(model, None).breakdown["per_hub"]
    assert per_hub["H1"]["sustainable_headcount"] == 0


def test_permanent_and_outsourced_always_sum_to_required():
    """The 60/40 split must never lose or invent a courier to rounding."""
    model = _model()
    for z1_demand in (0.0, 10.0, 137.0, 500.0, 1234.0):
        model.demand["Z1"] = z1_demand
        per_hub = WorkforceRequirementMetric().compute(model, None).breakdown["per_hub"]
        for entry in per_hub.values():
            assert (
                entry["required_permanent"] + entry["required_outsourced"]
                == entry["required_headcount"]
            )


def test_assumptions_are_returned_so_the_ui_can_show_its_working():
    """The honesty rule (CLAUDE.md §2): no hidden conversion factors."""
    assumptions = WorkforceRequirementMetric().compute(_model(), None).breakdown["assumptions"]
    assert assumptions["parcels_per_courier_hour"] == 18.0
    assert assumptions["productive_hours_per_shift"] == 7.5
    assert assumptions["permanent_share"] == 0.60
    assert assumptions["permanent_lead_time_days"] == 45


def test_metric_is_registered_and_therefore_agent_usable():
    """Registering a metric must expose it to every agent with no agent change."""
    from hubris.core.registry import METRIC, registry

    names = {m.name for m in registry.all(METRIC)}
    assert "workforce_requirement" in names
