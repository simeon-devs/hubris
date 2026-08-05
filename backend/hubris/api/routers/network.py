"""GET /network — hub/zone/flow data for the map (T-16). Not one of T-15's
literally-named endpoints, but the map can't render without geographic
coordinates, which none of /kpis /simulate /optimize /agents /scenarios
provide — this closes that gap so the frontend has one place to get it.

POST /network/refresh-distances (T-19) rebuilds the baseline od_matrix from
real OSRM drive distances, falling back to haversine x 1.3 automatically —
state.distance_mode records which one actually ran so the frontend/agents
never mistake fallback numbers for real road distances."""

from fastapi import APIRouter, HTTPException

from hubris.api.schemas import (
    FleetTypeInfo,
    FlowMapInfo,
    HubMapInfo,
    NetworkMapResponse,
    RefreshDistancesResponse,
    ZoneMapInfo,
)
from hubris.api.state import state
from hubris.api.schemas import RouteCostResponse
from hubris.engine.assignment import assigned_volume_by_hub, cost_to_serve_by_hub
from hubris.engine.route_cost import compute_route_cost
from hubris.engine.flow import solve_min_cost_flow
from hubris.engine.routing import refresh_od_matrix
from hubris.plugins.metrics.cost_to_serve import CostToServeMetric
from hubris.plugins.metrics.spare_capacity import SpareCapacityMetric
from hubris.plugins.metrics.utilization import UtilizationMetric
from hubris.plugins.metrics.workforce_requirement import WorkforceRequirementMetric

router = APIRouter()


@router.get("/route-cost", response_model=RouteCostResponse)
def get_route_cost(
    from_hub: str, to_zone: str, scenario_id: str | None = None
) -> RouteCostResponse:
    """Per-fleet transit cost for one hub→zone corridor — engine-computed
    (engine/route_cost.py). The UI's corridor inspector calls this instead
    of doing arithmetic in the browser (CLAUDE.md §2)."""
    try:
        model = state.get_model(scenario_id)
        return RouteCostResponse(**compute_route_cost(model, from_hub, to_zone))
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


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
    # T-37: the OLD utilisation definition, kept under its honest name —
    # dominant-hub assignment share (can exceed 100 on split zones).
    assigned = assigned_volume_by_hub(model)
    # Workforce pillars (ported from hubris-main): engine-computed headcount
    # per hub so no client ever derives staffing from parcel counts itself.
    workforce = WorkforceRequirementMetric().compute(model, None).breakdown["per_hub"]

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
            assignment_share_pct=round(
                (assigned.get(hub.id, 0.0) / hub.capacity * 100) if hub.capacity else 0.0, 2
            ),
            spare_capacity=spare.breakdown.get(hub.id, 0.0),
            cost_to_serve=cost_to_serve.get(hub.id, 0.0),
            hub_type=hub.hub_type,
            service_models=hub.service_models,
            required_headcount=workforce[hub.id]["required_headcount"],
            sustainable_headcount=workforce[hub.id]["sustainable_headcount"],
            headcount_gap=workforce[hub.id]["gap"],
            gap_direction=workforce[hub.id]["gap_direction"],
            required_permanent=workforce[hub.id]["required_permanent"],
            required_outsourced=workforce[hub.id]["required_outsourced"],
        )
        for hub in model.hubs
    ]
    zones = [
        ZoneMapInfo(
            id=z.id, name=z.name, lat=z.lat, lon=z.lon, emirate=z.emirate,
            demand=z.demand, service_model=z.service_model,
        )
        for z in model.zones
    ]
    flows = [
        FlowMapInfo(hub_id=hub_id, zone_id=zone_id, volume=volume)
        for hub_id, zone_volumes in flow.flows.items()
        for zone_id, volume in zone_volumes.items()
    ]
    fleet_types = [
        FleetTypeInfo(
            id=fleet.id,
            name=fleet.name,
            capacity=fleet.capacity,
            cost_per_km=fleet.cost_per_km,
            fixed_cost=fleet.fixed_cost,
            count_available=fleet.count_available,
            hub_id=fleet.hub_id,
        )
        for fleet in model.fleet_types
    ]

    return NetworkMapResponse(
        hubs=hubs,
        zones=zones,
        flows=flows,
        fleet_types=fleet_types,
        distance_mode=state.distance_mode,
        baseline_provenance=model.baseline_provenance,  # T-31
    )


@router.post("/network/refresh-distances", response_model=RefreshDistancesResponse)
def refresh_distances(use_osrm: bool = True) -> RefreshDistancesResponse:
    """Rebuild the baseline's od_matrix from real OSRM drive distances
    (falling back to haversine x 1.3 for the whole batch if OSRM is
    unreachable) and report the before/after cost-to-serve shift."""
    cost_before = CostToServeMetric().compute(state.baseline, None).value

    updated_model, mode = refresh_od_matrix(state.baseline, use_osrm=use_osrm)
    state.baseline = updated_model
    state.distance_mode = mode

    cost_after = CostToServeMetric().compute(state.baseline, None).value

    return RefreshDistancesResponse(
        distance_mode=mode,
        od_pairs_updated=len(updated_model.od_matrix),
        cost_to_serve_before=cost_before,
        cost_to_serve_after=cost_after,
    )
