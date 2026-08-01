"""GET /network — hub/zone/flow data for the map (T-16). Not one of T-15's
literally-named endpoints, but the map can't render without geographic
coordinates, which none of /kpis /simulate /optimize /agents /scenarios
provide — this closes that gap so the frontend has one place to get it."""

from fastapi import APIRouter, HTTPException

from hubris.api.schemas import FlowMapInfo, HubMapInfo, NetworkMapResponse, ZoneMapInfo
from hubris.api.state import state
from hubris.engine.assignment import cost_to_serve_by_hub
from hubris.engine.flow import solve_min_cost_flow
from hubris.plugins.metrics.spare_capacity import SpareCapacityMetric
from hubris.plugins.metrics.utilization import UtilizationMetric

router = APIRouter()


@router.get("/network", response_model=NetworkMapResponse)
def get_network(scenario_id: str | None = None) -> NetworkMapResponse:
    try:
        model = state.get_model(scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {scenario_id}") from exc

    utilization = UtilizationMetric().compute(model, None)
    spare = SpareCapacityMetric().compute(model, None)
    cost_to_serve = cost_to_serve_by_hub(model)
    flow = solve_min_cost_flow(model)

    hubs = [
        HubMapInfo(
            id=hub.id,
            name=hub.name,
            lat=hub.lat,
            lon=hub.lon,
            emirate=hub.emirate,
            capacity=hub.capacity,
            status=hub.status,
            utilization_pct=utilization.breakdown.get(hub.id, 0.0),
            spare_capacity=spare.breakdown.get(hub.id, 0.0),
            cost_to_serve=cost_to_serve.get(hub.id, 0.0),
        )
        for hub in model.hubs
    ]
    zones = [
        ZoneMapInfo(id=z.id, name=z.name, lat=z.lat, lon=z.lon, emirate=z.emirate, demand=z.demand)
        for z in model.zones
    ]
    flows = [
        FlowMapInfo(hub_id=hub_id, zone_id=zone_id, volume=volume)
        for hub_id, zone_volumes in flow.flows.items()
        for zone_id, volume in zone_volumes.items()
    ]

    return NetworkMapResponse(hubs=hubs, zones=zones, flows=flows)
