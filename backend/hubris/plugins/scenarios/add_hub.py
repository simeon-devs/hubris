"""Add a new hub — computes its OD entries to every zone so it's
immediately usable by flow/optimiser calls run against the resulting copy."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.models import OD, Hub
from hubris.core.registry import register_scenario
from hubris.engine.cost_model import derive_od_cost, reference_cost_per_km
from hubris.engine.geo import road_distance_km

AVG_SPEED_KMH = 40.0


@register_scenario
class AddHubScenario(ScenarioModule):
    name = "add_hub"
    params_schema = {
        "type": "object",
        "properties": {
            "id": {"type": "string"},
            "name": {"type": "string"},
            "lat": {"type": "number"},
            "lon": {"type": "number"},
            "emirate": {"type": "string"},
            "capacity": {"type": "number"},
            "fixed_cost": {"type": "number"},
            "handling_cost": {"type": "number"},
            "status": {"type": "string"},
        },
        "required": [
            "id",
            "name",
            "lat",
            "lon",
            "emirate",
            "capacity",
            "fixed_cost",
            "handling_cost",
        ],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        hub = Hub(
            id=params["id"],
            name=params["name"],
            lat=params["lat"],
            lon=params["lon"],
            emirate=params["emirate"],
            capacity=params["capacity"],
            fixed_cost=params["fixed_cost"],
            handling_cost=params["handling_cost"],
            status=params.get("status", "open"),
        )
        copy.hubs.append(hub)

        cost_per_km = reference_cost_per_km(copy.fleet_types)
        for zone in copy.zones:
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
