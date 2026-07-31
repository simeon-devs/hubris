"""A 2-hub/3-zone fixture where closing H2 is clearly cost-optimal: H2 is
cheaper per-unit for every zone, but its fixed cost (5000) massively
outweighs the transport savings versus keeping only the cheap-fixed-cost H1
(500) open, even though every zone then routes at a worse unit cost.

Hand math:
  both open : Z1,Z2->H2 (cheapest), Z3 either (tie, 8 each)
              transport = 10*4 + 10*3 + 5*8 = 40+30+40 = 110
              fixed = 500+5000 = 5500 -> total 5610
  H1 only   : transport = 10*5 + 10*6 + 5*8 = 50+60+40 = 150
              fixed = 500 -> total 650   <- optimal
  H2 only   : transport = 10*4 + 10*3 + 5*8 = 40+30+40 = 110
              fixed = 5000 -> total 5110
"""

from hubris.core.models import RawTables

CLOSE_HUB_RAW_TABLES = RawTables(
    hubs=[
        {
            "id": "H1",
            "name": "Cheap Hub",
            "lat": 25.2,
            "lon": 55.3,
            "emirate": "Dubai",
            "capacity": 100.0,
            "fixed_cost": 500.0,
            "handling_cost": 0.0,
            "status": "open",
        },
        {
            "id": "H2",
            "name": "Expensive Hub",
            "lat": 25.2,
            "lon": 55.3,
            "emirate": "Dubai",
            "capacity": 100.0,
            "fixed_cost": 5000.0,
            "handling_cost": 0.0,
            "status": "open",
        },
    ],
    zones=[
        {"id": "Z1", "name": "Zone One", "lat": 25.1, "lon": 55.2, "emirate": "Dubai", "demand": 10.0, "sla_hours": 24.0},
        {"id": "Z2", "name": "Zone Two", "lat": 25.3, "lon": 55.4, "emirate": "Dubai", "demand": 10.0, "sla_hours": 24.0},
        {"id": "Z3", "name": "Zone Three", "lat": 25.0, "lon": 55.0, "emirate": "Dubai", "demand": 5.0, "sla_hours": 24.0},
    ],
    fleet_types=[
        {
            "id": "F1",
            "name": "Van",
            "capacity": 50.0,
            "cost_per_km": 1.0,
            "fixed_cost": 100.0,
            "count_available": 5,
            "hub_id": None,
        },
    ],
    od_matrix=[
        {"from_id": "H1", "to_id": "Z1", "distance_km": 5.0, "time_min": 10.0, "cost": 5.0},
        {"from_id": "H1", "to_id": "Z2", "distance_km": 6.0, "time_min": 12.0, "cost": 6.0},
        {"from_id": "H1", "to_id": "Z3", "distance_km": 8.0, "time_min": 16.0, "cost": 8.0},
        {"from_id": "H2", "to_id": "Z1", "distance_km": 4.0, "time_min": 8.0, "cost": 4.0},
        {"from_id": "H2", "to_id": "Z2", "distance_km": 3.0, "time_min": 6.0, "cost": 3.0},
        {"from_id": "H2", "to_id": "Z3", "distance_km": 8.0, "time_min": 16.0, "cost": 8.0},
    ],
    current_assignments=[
        {"zone_id": "Z1", "hub_id": "H2", "volume": 10.0},
        {"zone_id": "Z2", "hub_id": "H2", "volume": 10.0},
        {"zone_id": "Z3", "hub_id": "H1", "volume": 5.0},
    ],
)
