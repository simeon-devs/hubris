"""Add a new demand zone (a customer) — computes its OD entries from every
hub so it's immediately usable by flow/optimiser calls run against the
resulting copy."""

from hubris.core import assumptions
from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.models import OD, Zone
from hubris.core.registry import register_scenario
from hubris.engine.cost_model import derive_od_cost, reference_cost_per_km
from hubris.engine.geo import road_distance_km

AVG_SPEED_KMH = assumptions.value("avg_speed_kmh")  # T-32


@register_scenario
class AddCustomerScenario(ScenarioModule):
    name = "add_customer"
    params_schema = {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "name": {"type": "string"},
            "lat": {"type": "number"},
            "lon": {"type": "number"},
            "emirate": {"type": "string"},
            "demand": {"type": "number"},
            "sla_hours": {"type": "number"},
        },
        "required": ["id", "name", "lat", "lon", "emirate", "demand"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        zone = Zone(
            id=params["id"],
            name=params["name"],
            lat=params["lat"],
            lon=params["lon"],
            emirate=params["emirate"],
            demand=params["demand"],
            sla_hours=params.get("sla_hours", 24.0),
        )
        copy.zones.append(zone)
        copy.demand[zone.id] = zone.demand

        cost_per_km = reference_cost_per_km(copy.fleet_types)
        for hub in copy.hubs:
            distance_km = round(road_distance_km(hub.lat, hub.lon, zone.lat, zone.lon), 2)
            time_min = round(distance_km / AVG_SPEED_KMH * 60, 1)
            cost = derive_od_cost(distance_km, hub.handling_cost, cost_per_km)
            copy.od_matrix[(hub.id, zone.id)] = OD(
                from_id=hub.id,
                to_id=zone.id,
                distance_km=distance_km,
                time_min=time_min,
                cost=cost,
            )
        return copy
