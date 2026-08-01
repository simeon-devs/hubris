"""Hand-checkable test for T-19's H3 demand aggregation.

At resolution 5, points A (25.200, 55.300) and B (25.201, 55.301) — ~150m
apart — fall in the same hex cell (verified directly against the h3
library: both resolve to cell 8543a137fffffff), while point C (24.450,
54.400), far away, falls in a different cell. So aggregating [A, B, C]
must produce exactly 2 zones: one with A+B's demand summed, one with C's
demand alone.
"""

from hubris.engine.h3_zoning import aggregate_to_h3_zones


def test_nearby_points_aggregate_into_one_hex_zone_summing_demand():
    points = [
        {"lat": 25.200, "lon": 55.300, "demand": 10.0, "emirate": "Dubai", "sla_hours": 24.0},
        {"lat": 25.201, "lon": 55.301, "demand": 15.0, "emirate": "Dubai", "sla_hours": 12.0},
        {"lat": 24.450, "lon": 54.400, "demand": 7.0, "emirate": "Abu Dhabi", "sla_hours": 24.0},
    ]

    zones = aggregate_to_h3_zones(points, resolution=5)

    assert len(zones) == 2
    demand_by_zone = sorted(z["demand"] for z in zones)
    assert demand_by_zone == [7.0, 25.0]  # A+B summed to 25, C alone at 7

    merged_zone = next(z for z in zones if z["demand"] == 25.0)
    assert merged_zone["emirate"] == "Dubai"
    assert merged_zone["sla_hours"] == 12.0  # tightest of A's 24 and B's 12
    # the zone's coordinates are the hex cell's own centroid, not either
    # input point verbatim
    assert merged_zone["lat"] != 25.200
    assert merged_zone["lat"] != 25.201


def test_far_apart_points_stay_in_separate_zones():
    points = [
        {"lat": 25.200, "lon": 55.300, "demand": 10.0, "emirate": "Dubai"},
        {"lat": 24.450, "lon": 54.400, "demand": 7.0, "emirate": "Abu Dhabi"},
    ]

    zones = aggregate_to_h3_zones(points, resolution=5)

    assert len(zones) == 2
    assert {z["demand"] for z in zones} == {10.0, 7.0}


def test_default_sla_hours_is_24_when_not_provided():
    points = [{"lat": 25.2, "lon": 55.3, "demand": 5.0, "emirate": "Dubai"}]
    zones = aggregate_to_h3_zones(points, resolution=5)
    assert zones[0]["sla_hours"] == 24.0
