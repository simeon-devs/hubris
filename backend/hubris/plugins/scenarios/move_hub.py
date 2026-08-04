"""Move an existing hub to a new location — recomputes its OD entries to
every zone so the moved hub is immediately usable by flow/optimiser calls
run against the resulting copy."""

from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.models import OD
from hubris.core.registry import register_scenario
from hubris.engine.cost_model import derive_od_cost, reference_cost_per_km
from hubris.engine.geo import road_distance_km

AVG_SPEED_KMH = 40.0


@register_scenario
class MoveHubScenario(ScenarioModule):
    name = "move_hub"
    params_schema = {
        "type": "object",
        "properties": {
            "hub_id": {"type": "string"},
            "new_lat": {"type": "number"},
            "new_lon": {"type": "number"},
        },
        "required": ["hub_id", "new_lat", "new_lon"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True, update={"flow_volumes": None})  # structure changed - stale flow split must not survive
        hub = next(h for h in copy.hubs if h.id == params["hub_id"])
        hub.lat = params["new_lat"]
        hub.lon = params["new_lon"]

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
