"""Synthetic EMX-shaped dataset generator (SCHEMA.md §3).

Deterministic (same seed -> same data) so the whole system can be built and
tested against this before the real dataset is revealed at the event. On the
day, only the ingestion mapping (T-06) changes — everything downstream reads
the same canonical shape this produces.
"""

import math
import random

from hubris.core.models import RawTables

# Approximate emirate centroids (lat, lon), UAE.
EMIRATE_CENTROIDS: dict[str, tuple[float, float]] = {
    "Abu Dhabi": (24.4539, 54.3773),
    "Dubai": (25.2048, 55.2708),
    "Sharjah": (25.3463, 55.4209),
    "Ajman": (25.4052, 55.5136),
    "Umm Al Quwain": (25.5647, 55.5534),
    "Ras Al Khaimah": (25.7895, 55.9432),
    "Fujairah": (25.1288, 56.3265),
}

# One hub per emirate, plus a second hub in the two busiest markets -> 9 hubs.
HUB_EMIRATES = [
    "Abu Dhabi",
    "Abu Dhabi",
    "Dubai",
    "Dubai",
    "Sharjah",
    "Ajman",
    "Umm Al Quwain",
    "Ras Al Khaimah",
    "Fujairah",
]

# Zones per emirate, weighted toward the busier markets. Sums to 100.
ZONES_PER_EMIRATE = {
    "Abu Dhabi": 25,
    "Dubai": 27,
    "Sharjah": 15,
    "Ajman": 10,
    "Umm Al Quwain": 6,
    "Ras Al Khaimah": 10,
    "Fujairah": 7,
}

# Fleet classes available network-wide (not tied to one hub -> hub_id=None,
# which SCHEMA.md's fleet_types.hub_id nullability allows).
FLEET_TYPES = [
    {
        "id": "F1",
        "name": "Bike",
        "capacity": 15.0,
        "cost_per_km": 0.8,
        "fixed_cost": 150.0,
        "count_available": 40,
        "hub_id": None,
    },
    {
        "id": "F2",
        "name": "Van",
        "capacity": 120.0,
        "cost_per_km": 1.6,
        "fixed_cost": 400.0,
        "count_available": 25,
        "hub_id": None,
    },
    {
        "id": "F3",
        "name": "Small Truck",
        "capacity": 350.0,
        "cost_per_km": 2.4,
        "fixed_cost": 700.0,
        "count_available": 12,
        "hub_id": None,
    },
    {
        "id": "F4",
        "name": "Truck",
        "capacity": 800.0,
        "cost_per_km": 3.5,
        "fixed_cost": 1200.0,
        "count_available": 6,
        "hub_id": None,
    },
]

AVG_SPEED_KMH = 40.0
ROAD_FACTOR = 1.3  # haversine x ~1.3 fallback per SCHEMA.md §2, until T-19 wires real roads


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _jitter(rng: random.Random, center: tuple[float, float], spread_deg: float) -> tuple[float, float]:
    lat, lon = center
    return (lat + rng.uniform(-spread_deg, spread_deg), lon + rng.uniform(-spread_deg, spread_deg))


def generate_synthetic_raw_tables(seed: int = 42) -> RawTables:
    rng = random.Random(seed)

    hubs = []
    for i, emirate in enumerate(HUB_EMIRATES, start=1):
        lat, lon = _jitter(rng, EMIRATE_CENTROIDS[emirate], spread_deg=0.05)
        hubs.append(
            {
                "id": f"H{i}",
                "name": f"{emirate} Hub {i}",
                "lat": round(lat, 5),
                "lon": round(lon, 5),
                "emirate": emirate,
                "capacity": float(rng.randint(1500, 4000)),
                "fixed_cost": float(rng.randint(8000, 20000)),
                "handling_cost": round(rng.uniform(1.5, 3.5), 2),
                "status": "open",
            }
        )

    zones = []
    zone_seq = 1
    for emirate, count in ZONES_PER_EMIRATE.items():
        for _ in range(count):
            lat, lon = _jitter(rng, EMIRATE_CENTROIDS[emirate], spread_deg=0.2)
            zones.append(
                {
                    "id": f"Z{zone_seq}",
                    "name": f"{emirate} Zone {zone_seq}",
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "emirate": emirate,
                    "demand": float(rng.randint(5, 80)),
                    "sla_hours": rng.choice([12.0, 24.0, 48.0]),
                }
            )
            zone_seq += 1

    fleet_types = [dict(f) for f in FLEET_TYPES]
    reference_cost_per_km = next(f["cost_per_km"] for f in fleet_types if f["name"] == "Van")

    od_matrix = []
    distances: dict[tuple[str, str], float] = {}
    for hub in hubs:
        for zone in zones:
            distance_km = round(
                _haversine_km(hub["lat"], hub["lon"], zone["lat"], zone["lon"]) * ROAD_FACTOR, 2
            )
            time_min = round(distance_km / AVG_SPEED_KMH * 60, 1)
            # cost = distance x cost_per_km + handling_cost, per SCHEMA.md §2's
            # "no cost model given" derivation.
            cost = round(distance_km * reference_cost_per_km + hub["handling_cost"], 2)
            distances[(hub["id"], zone["id"])] = distance_km
            od_matrix.append(
                {
                    "from_id": hub["id"],
                    "to_id": zone["id"],
                    "distance_km": distance_km,
                    "time_min": time_min,
                    "cost": cost,
                }
            )

    # Status-quo proxy baseline: nearest-open-hub-with-capacity, splitting a
    # zone's demand across hubs if the nearest doesn't have enough room left
    # (SCHEMA.md §2: "no current assignment -> reconstruct a nearest-open-hub
    # -with-capacity baseline").
    remaining_capacity = {h["id"]: h["capacity"] for h in hubs}
    current_assignments = []
    for zone in zones:
        nearest_hub_ids = sorted(
            (h["id"] for h in hubs), key=lambda hub_id: distances[(hub_id, zone["id"])]
        )
        remaining_demand = zone["demand"]
        for hub_id in nearest_hub_ids:
            if remaining_demand <= 0:
                break
            available = remaining_capacity[hub_id]
            if available <= 0:
                continue
            volume = min(available, remaining_demand)
            current_assignments.append(
                {"zone_id": zone["id"], "hub_id": hub_id, "volume": volume}
            )
            remaining_capacity[hub_id] -= volume
            remaining_demand -= volume
        if remaining_demand > 0:
            raise RuntimeError(
                f"Synthetic network under-capacity: zone {zone['id']} has "
                f"{remaining_demand} unplaced demand. Increase hub capacities."
            )

    return RawTables(
        hubs=hubs,
        zones=zones,
        fleet_types=fleet_types,
        od_matrix=od_matrix,
        current_assignments=current_assignments,
    )
