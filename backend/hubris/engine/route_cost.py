"""Multi-modal route cost — the honest home of `calculateRouteCost`.

The UI's corridor inspector asks "what does moving a parcel H→Z cost by
vehicle type?". Per CLAUDE.md §2 the browser must not compute that figure,
so it is computed here from fields that already exist in the model:

  OD row      → distance_km, time_min, cost (the canonical per-parcel figure)
  FleetType   → cost_per_km, fixed_cost, capacity
  Hub         → handling_cost (per parcel)

Per fleet: variable = distance × cost_per_km; trip = variable + vehicle
fixed; per-parcel = trip / vehicle capacity + hub handling. Every component
is returned so the UI can show the working instead of a bare number.
"""

from hubris.core.contracts import NetworkModel


def compute_route_cost(model: NetworkModel, from_hub: str, to_zone: str) -> dict:
    hub = next((h for h in model.hubs if h.id == from_hub), None)
    if hub is None:
        raise KeyError(f"Unknown hub: {from_hub}")
    if not any(z.id == to_zone for z in model.zones):
        raise KeyError(f"Unknown zone: {to_zone}")
    od = model.od_matrix[(from_hub, to_zone)]  # KeyError if pair missing

    modes = []
    for fleet in model.fleet_types:
        variable_cost = round(od.distance_km * fleet.cost_per_km, 2)
        trip_cost = round(variable_cost + fleet.fixed_cost, 2)
        per_parcel_transport = round(trip_cost / fleet.capacity, 4) if fleet.capacity else 0.0
        modes.append(
            {
                "fleet_id": fleet.id,
                "fleet_name": fleet.name,
                "vehicle_capacity": fleet.capacity,
                "cost_per_km": fleet.cost_per_km,
                "variable_cost": variable_cost,
                "vehicle_fixed_cost": fleet.fixed_cost,
                "trip_cost": trip_cost,
                "cost_per_parcel": round(per_parcel_transport + hub.handling_cost, 2),
            }
        )
    modes.sort(key=lambda m: m["cost_per_parcel"])

    return {
        "from_hub": from_hub,
        "to_zone": to_zone,
        "distance_km": od.distance_km,
        "time_min": od.time_min,
        "od_cost_per_parcel": od.cost,
        "handling_cost_per_parcel": hub.handling_cost,
        "modes": modes,
    }
