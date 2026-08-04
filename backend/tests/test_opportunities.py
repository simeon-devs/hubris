"""Hand-checkable tests for T-21's opportunity scanner. Each finder is
tested in isolation with a small fixture engineered to trigger (or not
trigger) exactly the behavior under test, per CLAUDE.md's tiny-fixture
testing convention.
"""

from hubris.core.contracts import NetworkModel
from hubris.core.models import RawTables
from hubris.engine.opportunities import (
    find_displaced_zones,
    find_idle_next_to_overload,
    find_overlapping_coverage,
    scan_opportunities,
)
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _overlap_model() -> NetworkModel:
    # H1 and H2 are both cheap (near-tied) options for Z1/Z2/Z3 -> their
    # PRIMARY_COST_RATIO catchments should overlap on all 3. H3 is only
    # ever competitive for Z4 -> no overlap with H1/H2. H4 (T-37) sits 2km
    # from H1 but is ~20% pricier for every Dubai zone: outside the 15%
    # primary-catchment band (never in an overlap pair) AND never wins any
    # flow -> genuinely 0% utilized under the flow-based definition, so the
    # full-pipeline idle-next-to-overload scan has a real idle hub to find.
    raw = RawTables(
        hubs=[
            {
                "id": "H1", "name": "Hub One", "lat": 25.20, "lon": 55.30, "emirate": "Dubai",
                "capacity": 100.0, "fixed_cost": 0.0, "handling_cost": 0.0, "status": "open",
            },
            {
                "id": "H2", "name": "Hub Two", "lat": 25.21, "lon": 55.31, "emirate": "Dubai",
                "capacity": 100.0, "fixed_cost": 0.0, "handling_cost": 0.0, "status": "open",
            },
            {
                "id": "H3", "name": "Hub Three", "lat": 24.45, "lon": 54.40, "emirate": "Abu Dhabi",
                "capacity": 100.0, "fixed_cost": 0.0, "handling_cost": 0.0, "status": "open",
            },
            {
                "id": "H4", "name": "Hub Four", "lat": 25.21, "lon": 55.29, "emirate": "Dubai",
                "capacity": 100.0, "fixed_cost": 0.0, "handling_cost": 0.0, "status": "open",
            },
        ],
        zones=[
            {"id": "Z1", "name": "Z1", "lat": 25.19, "lon": 55.29, "emirate": "Dubai", "demand": 30.0, "sla_hours": 24.0},
            {"id": "Z2", "name": "Z2", "lat": 25.22, "lon": 55.32, "emirate": "Dubai", "demand": 30.0, "sla_hours": 24.0},
            {"id": "Z3", "name": "Z3", "lat": 25.20, "lon": 55.305, "emirate": "Dubai", "demand": 20.0, "sla_hours": 24.0},
            {"id": "Z4", "name": "Z4", "lat": 24.46, "lon": 54.41, "emirate": "Abu Dhabi", "demand": 10.0, "sla_hours": 24.0},
        ],
        fleet_types=[],
        od_matrix=[
            {"from_id": "H1", "to_id": "Z1", "distance_km": 1.0, "time_min": 2.0, "cost": 10.0},
            {"from_id": "H2", "to_id": "Z1", "distance_km": 1.0, "time_min": 2.0, "cost": 10.5},
            {"from_id": "H3", "to_id": "Z1", "distance_km": 130.0, "time_min": 195.0, "cost": 200.0},
            {"from_id": "H1", "to_id": "Z2", "distance_km": 1.0, "time_min": 2.0, "cost": 10.5},
            {"from_id": "H2", "to_id": "Z2", "distance_km": 1.0, "time_min": 2.0, "cost": 10.0},
            {"from_id": "H3", "to_id": "Z2", "distance_km": 130.0, "time_min": 195.0, "cost": 200.0},
            {"from_id": "H1", "to_id": "Z3", "distance_km": 1.0, "time_min": 2.0, "cost": 10.0},
            {"from_id": "H2", "to_id": "Z3", "distance_km": 1.0, "time_min": 2.0, "cost": 10.2},
            {"from_id": "H3", "to_id": "Z3", "distance_km": 130.0, "time_min": 195.0, "cost": 200.0},
            {"from_id": "H1", "to_id": "Z4", "distance_km": 130.0, "time_min": 195.0, "cost": 200.0},
            {"from_id": "H2", "to_id": "Z4", "distance_km": 130.0, "time_min": 195.0, "cost": 200.0},
            {"from_id": "H3", "to_id": "Z4", "distance_km": 1.0, "time_min": 2.0, "cost": 10.0},
            {"from_id": "H4", "to_id": "Z1", "distance_km": 2.0, "time_min": 4.0, "cost": 12.0},
            {"from_id": "H4", "to_id": "Z2", "distance_km": 2.0, "time_min": 4.0, "cost": 12.6},
            {"from_id": "H4", "to_id": "Z3", "distance_km": 2.0, "time_min": 4.0, "cost": 12.0},
            {"from_id": "H4", "to_id": "Z4", "distance_km": 130.0, "time_min": 195.0, "cost": 200.0},
        ],
        # T-37: scan_opportunities now derives utilization from the FLOW
        # (assignments no longer drive it) — flow lands Z1+Z3 on H1 (50%),
        # Z2 on H2 (30%), nothing on H4 (0%, the nearby idle hub).
        current_assignments=[
            {"zone_id": "Z1", "hub_id": "H1", "volume": 30.0},
            {"zone_id": "Z2", "hub_id": "H1", "volume": 30.0},
            {"zone_id": "Z3", "hub_id": "H1", "volume": 20.0},
            {"zone_id": "Z4", "hub_id": "H3", "volume": 10.0},
        ],
    )
    return NetworkModel.from_raw_tables(raw)


def test_find_overlapping_coverage_flags_the_near_tied_pair_only():
    model = _overlap_model()
    findings = find_overlapping_coverage(model)

    pairs = {(f["hub_a_id"], f["hub_b_id"]) for f in findings}
    assert pairs == {("H1", "H2")}  # H3 never overlaps H1/H2
    finding = findings[0]
    assert finding["overlap_zone_count"] == 3
    assert set(finding["overlap_zone_ids"]) == {"Z1", "Z2", "Z3"}
    assert finding["overlap_demand"] == 80.0  # 30 + 30 + 20
    assert "H1" in finding["why"] and "H2" in finding["why"]


def test_find_displaced_zones_flags_only_the_clearly_wrong_assignment():
    model = _overlap_model()
    # Z4's cheapest hub is H3 (cost 10.0), but assign it to H1 instead
    # (cost 200.0) -> a huge, obviously-material excess.
    bad_assignments = dict(model.assignments or {})
    bad_assignments["Z4"] = "H1"

    displaced = find_displaced_zones(model, bad_assignments)

    assert len(displaced) == 1
    d = displaced[0]
    assert d.zone_id == "Z4"
    assert d.actual_hub_id == "H1"
    assert d.cheapest_hub_id == "H3"
    assert d.excess_cost_per_unit == 190.0
    assert d.excess_cost_total == 1900.0  # 190.0 x 10.0 demand


def test_find_displaced_zones_ignores_small_excess_below_materiality_threshold():
    model = _overlap_model()
    # Z1's actual (H1, 10.0) vs cheapest (H1, 10.0) -> no excess at all;
    # the correctly-assigned baseline shouldn't flag anything.
    displaced = find_displaced_zones(model, model.assignments or {})
    assert displaced == []


def test_find_idle_next_to_overload_flags_hot_hub_next_to_a_relatively_idle_one():
    model = _overlap_model()
    # H1 well above the 3-hub average (10+80+10)/3=33.3 x1.5=50 cutoff;
    # H2 well below 33.3 x0.75=25 cutoff; H3 is neither.
    utilization = {"H1": 90.0, "H2": 10.0, "H3": 10.0}
    spare = {"H1": 10.0, "H2": 90.0, "H3": 90.0}

    findings = find_idle_next_to_overload(model, utilization, spare)

    assert len(findings) == 1
    f = findings[0]
    assert f["overloaded_hub_id"] == "H1"
    assert f["idle_hub_id"] == "H2"
    assert f["idle_spare_capacity"] == 90.0


def test_find_idle_next_to_overload_ignores_a_balanced_network():
    model = _overlap_model()
    utilization = {"H1": 35.0, "H2": 32.0, "H3": 34.0}
    spare = {"H1": 65.0, "H2": 68.0, "H3": 66.0}

    assert find_idle_next_to_overload(model, utilization, spare) == []


def test_scan_opportunities_returns_all_three_types_with_consistent_totals():
    model = _overlap_model()
    result = scan_opportunities(model)

    assert result["inefficiency_types_found"] == 2  # overlap + idle_next_to_overload fire here
    assert result["total_opportunities"] == len(result["overlapping_coverage"]) + len(
        result["far_hub_service"]
    ) + len(result["idle_next_to_overload"])
    assert result["overlapping_coverage"]  # H1/H2 overlap
    # T-37 re-derivation: flow-based utilization is H1=50, H2=30, H3=10,
    # H4=0 -> avg 22.5, hot cutoff 33.75 (H1 fires), idle cutoff 16.9
    # (H4 at 0% and 2.6 road-km away fires; H3 idle too but ~160 road-km
    # away -> filtered by NEARBY_KM).
    idle = result["idle_next_to_overload"]
    assert [(f["overloaded_hub_id"], f["idle_hub_id"]) for f in idle] == [("H1", "H4")]


def test_scan_opportunities_smoke_test_on_tiny_fixture_never_raises():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)
    result = scan_opportunities(model)
    assert set(result.keys()) == {
        "overlapping_coverage",
        "far_hub_service",
        "idle_next_to_overload",
        "total_opportunities",
        "inefficiency_types_found",
    }
