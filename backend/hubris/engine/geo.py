"""Shared geo utility: haversine distance, with the road-factor fallback used
whenever a real routing engine isn't wired up yet (SCHEMA.md §2, T-19 later
replaces this with OSRM/Valhalla/ORS)."""

import math

ROAD_FACTOR = 1.3  # haversine x ~1.3 fallback per SCHEMA.md §2


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def road_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversine_km(lat1, lon1, lat2, lon2) * ROAD_FACTOR
