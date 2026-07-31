"""Shared 'no cost model given' derivation (SCHEMA.md §2): cost = distance x
cost_per_km + handling_cost. Used by scenarios that add/move a hub or zone
and need to (re)compute its OD entries."""

from hubris.core.models import FleetType


def reference_cost_per_km(fleet_types: list[FleetType]) -> float:
    for fleet in fleet_types:
        if fleet.name == "Van":
            return fleet.cost_per_km
    return fleet_types[0].cost_per_km if fleet_types else 1.6


def derive_od_cost(distance_km: float, handling_cost: float, cost_per_km: float) -> float:
    return round(distance_km * cost_per_km + handling_cost, 2)
