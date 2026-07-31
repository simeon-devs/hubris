"""Tiny hand-checkable fixture: 2 hubs, 3 zones (CLAUDE.md §7 testing convention)."""

from hubris.core.models import RawTables

TINY_RAW_TABLES = RawTables(
    hubs=[
        {
            "id": "H1",
            "name": "Hub One",
            "lat": 25.2,
            "lon": 55.3,
            "emirate": "Dubai",
            "capacity": 100.0,
            "fixed_cost": 1000.0,
            "handling_cost": 2.0,
            "status": "open",
        },
        {
            "id": "H2",
            "name": "Hub Two",
            "lat": 24.45,
            "lon": 54.4,
            "emirate": "Abu Dhabi",
            "capacity": 100.0,
            "fixed_cost": 900.0,
            "handling_cost": 2.5,
            "status": "open",
        },
    ],
    zones=[
        {
            "id": "Z1",
            "name": "Zone One",
            "lat": 25.1,
            "lon": 55.2,
            "emirate": "Dubai",
            "demand": 30.0,
            "sla_hours": 24.0,
        },
        {
            "id": "Z2",
            "name": "Zone Two",
            "lat": 25.3,
            "lon": 55.4,
            "emirate": "Dubai",
            "demand": 20.0,
            "sla_hours": 24.0,
        },
        {
            "id": "Z3",
            "name": "Zone Three",
            "lat": 24.5,
            "lon": 54.5,
            "emirate": "Abu Dhabi",
            "demand": 10.0,
            "sla_hours": 24.0,
        },
    ],
    fleet_types=[
        {
            "id": "F1",
            "name": "Van",
            "capacity": 50.0,
            "cost_per_km": 1.5,
            "fixed_cost": 100.0,
            "count_available": 5,
            "hub_id": "H1",
        },
    ],
    od_matrix=[
        {"from_id": "H1", "to_id": "Z1", "distance_km": 5.0, "time_min": 10.0, "cost": 10.0},
        {"from_id": "H1", "to_id": "Z2", "distance_km": 8.0, "time_min": 15.0, "cost": 14.0},
        {"from_id": "H1", "to_id": "Z3", "distance_km": 140.0, "time_min": 100.0, "cost": 220.0},
        {"from_id": "H2", "to_id": "Z1", "distance_km": 135.0, "time_min": 95.0, "cost": 210.0},
        {"from_id": "H2", "to_id": "Z2", "distance_km": 140.0, "time_min": 100.0, "cost": 220.0},
        {"from_id": "H2", "to_id": "Z3", "distance_km": 6.0, "time_min": 12.0, "cost": 12.0},
    ],
    # Z1 is deliberately split across both hubs to prove dominant-hub selection.
    current_assignments=[
        {"zone_id": "Z1", "hub_id": "H1", "volume": 20.0},
        {"zone_id": "Z1", "hub_id": "H2", "volume": 10.0},
        {"zone_id": "Z2", "hub_id": "H1", "volume": 20.0},
        {"zone_id": "Z3", "hub_id": "H2", "volume": 10.0},
    ],
)
