"""Convert a hub between Micro and Full — the judges' own question ("do you
consider the network type when choosing a site?") as a live lever.

Capability is the thing that changes (R1): a Micro→Full conversion ADDS the
Express (same-day) capability, so the scenario derives real OD edges from
the hub to every Express zone — same derivation as add_hub, so a converted
hub and a newly-built hub price identically. Full→Micro REMOVES the
capability and its Express edges; if that leaves same-day demand
unreachable, the flow solve reports it as unmet — honestly, not silently.

The file carries no conversion price (fit-out cost, licence), so none is
invented: fixed/handling costs stay the hub's own, and the brief says so.
"""

from hubris.core import assumptions
from hubris.core.contracts import NetworkModel, ScenarioModule
from hubris.core.models import OD
from hubris.core.registry import register_scenario
from hubris.engine.cost_model import derive_od_cost, reference_cost_per_km
from hubris.engine.geo import road_distance_km

AVG_SPEED_KMH = assumptions.value("avg_speed_kmh")

FULL = "Full Hub"
MICRO = "Micro Hub"
FULL_MODELS = ["Standard", "Express"]
MICRO_MODELS = ["Standard"]


@register_scenario
class ConvertHubTypeScenario(ScenarioModule):
    name = "convert_hub_type"
    params_schema = {
        "type": "object",
        "properties": {
            "hub_id": {"type": "string"},
            "to": {
                "type": "string",
                "enum": [FULL, MICRO],
                "description": "Target type. Full adds Express capability; Micro removes it.",
            },
        },
        "required": ["hub_id", "to"],
    }

    def apply(self, model: NetworkModel, params: dict) -> NetworkModel:
        copy = model.model_copy(deep=True)
        hub = next((h for h in copy.hubs if h.id == params["hub_id"]), None)
        if hub is None:
            raise ValueError(f"unknown hub_id: {params['hub_id']}")
        if hub.hub_type is None:
            raise ValueError(f"{hub.id} carries no hub type — this dataset has no capability data")
        if hub.hub_type not in (FULL, MICRO):
            raise ValueError(f"{hub.id} is a {hub.hub_type} — only Full/Micro hubs convert")
        target = params["to"]
        if hub.hub_type == target:
            raise ValueError(f"{hub.id} is already a {target}")

        if target == FULL:
            hub.hub_type = FULL
            hub.service_models = list(FULL_MODELS)
            # New capability -> new edges, derived exactly like add_hub's.
            cost_per_km = reference_cost_per_km(copy.fleet_types)
            for zone in copy.zones:
                if zone.service_model != "Express":
                    continue
                if (hub.id, zone.id) in copy.od_matrix:
                    continue
                distance_km = round(road_distance_km(hub.lat, hub.lon, zone.lat, zone.lon), 2)
                copy.od_matrix[(hub.id, zone.id)] = OD(
                    from_id=hub.id,
                    to_id=zone.id,
                    distance_km=distance_km,
                    time_min=round(distance_km / AVG_SPEED_KMH * 60, 1),
                    cost=derive_od_cost(distance_km, hub.handling_cost, cost_per_km),
                )
        else:
            hub.hub_type = MICRO
            hub.service_models = list(MICRO_MODELS)
            express_zones = {z.id for z in copy.zones if z.service_model == "Express"}
            for key in [k for k in copy.od_matrix if k[0] == hub.id and k[1] in express_zones]:
                del copy.od_matrix[key]
        return copy
