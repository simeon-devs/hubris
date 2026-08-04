"""Real drive-distance/time provider (T-19): OSRM's HTTP API, with an
automatic haversine x 1.3 fallback if the routing engine is unreachable —
CLAUDE.md §8: "Don't add heavyweight dependencies without a fallback (e.g.
OSRM setup can fail — keep haversine)." Every call reports which mode it
used (`"osrm"` or `"haversine_fallback"`) for the WHOLE batch — never a
silent per-pair mix — so a demo never mistakes fallback numbers for real
drive distances.

Defaults to OSRM's public demo server (no self-hosting required to get
real road distances working immediately); point `OSRM_BASE_URL` at a
self-hosted instance for production/event-day use.
"""

import os

import httpx
from pydantic import BaseModel

from hubris.core import assumptions

from hubris.core.contracts import NetworkModel
from hubris.core.models import OD
from hubris.engine.cost_model import derive_od_cost, reference_cost_per_km
from hubris.engine.geo import road_distance_km

OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org")
OSRM_TIMEOUT_SECONDS = float(
    os.environ.get("OSRM_TIMEOUT_SECONDS", str(assumptions.value("osrm_timeout_seconds")))
)

AVG_SPEED_KMH_FALLBACK = assumptions.value("avg_speed_kmh")

MODE_OSRM = "osrm"
MODE_FALLBACK = "haversine_fallback"


class RouteResult(BaseModel):
    distance_km: float
    time_min: float


Coord = tuple[str, float, float]  # (id, lat, lon)


def _osrm_table(
    hub_coords: list[Coord], zone_coords: list[Coord]
) -> dict[tuple[str, str], RouteResult] | None:
    """One OSRM Table API call for the whole hub x zone matrix. Returns
    None (triggering the fallback) on any network error, non-OK response,
    or malformed/incomplete data — never a partial result."""
    all_points = hub_coords + zone_coords
    coords_str = ";".join(f"{lon},{lat}" for _, lat, lon in all_points)
    n_hubs = len(hub_coords)
    sources = ";".join(str(i) for i in range(n_hubs))
    destinations = ";".join(str(i) for i in range(n_hubs, len(all_points)))

    try:
        response = httpx.get(
            f"{OSRM_BASE_URL}/table/v1/driving/{coords_str}",
            params={
                "sources": sources,
                "destinations": destinations,
                "annotations": "distance,duration",
            },
            timeout=OSRM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        if data.get("code") != "Ok":
            return None

        durations = data["durations"]
        distances = data["distances"]
        result: dict[tuple[str, str], RouteResult] = {}
        for i, (hub_id, _, _) in enumerate(hub_coords):
            for j, (zone_id, _, _) in enumerate(zone_coords):
                duration_s = durations[i][j]
                distance_m = distances[i][j]
                if duration_s is None or distance_m is None:
                    return None  # an unreachable pair -> bail to fallback for the whole batch
                result[(hub_id, zone_id)] = RouteResult(
                    distance_km=round(distance_m / 1000, 2),
                    time_min=round(duration_s / 60, 1),
                )
        return result
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        return None


def _haversine_matrix(
    hub_coords: list[Coord], zone_coords: list[Coord]
) -> dict[tuple[str, str], RouteResult]:
    result: dict[tuple[str, str], RouteResult] = {}
    for hub_id, hlat, hlon in hub_coords:
        for zone_id, zlat, zlon in zone_coords:
            distance_km = round(road_distance_km(hlat, hlon, zlat, zlon), 2)
            time_min = round(distance_km / AVG_SPEED_KMH_FALLBACK * 60, 1)
            result[(hub_id, zone_id)] = RouteResult(distance_km=distance_km, time_min=time_min)
    return result


def get_route_matrix(
    hub_coords: list[Coord], zone_coords: list[Coord], use_osrm: bool = True
) -> tuple[dict[tuple[str, str], RouteResult], str]:
    """Every hub x zone pair's (distance_km, time_min), plus which mode was
    used for the whole batch: `MODE_OSRM` or `MODE_FALLBACK`."""
    if use_osrm:
        result = _osrm_table(hub_coords, zone_coords)
        if result is not None:
            return result, MODE_OSRM
    return _haversine_matrix(hub_coords, zone_coords), MODE_FALLBACK


def refresh_od_matrix(model: NetworkModel, use_osrm: bool = True) -> tuple[NetworkModel, str]:
    """Rebuild the model's od_matrix from real drive distances/times where
    available, falling back to haversine x 1.3 for the whole matrix if OSRM
    isn't reachable. Returns the updated model copy + the mode used."""
    hub_coords = [(h.id, h.lat, h.lon) for h in model.hubs]
    zone_coords = [(z.id, z.lat, z.lon) for z in model.zones]
    routes, mode = get_route_matrix(hub_coords, zone_coords, use_osrm=use_osrm)

    cost_per_km = reference_cost_per_km(model.fleet_types)
    hub_by_id = {h.id: h for h in model.hubs}

    new_od_matrix = {}
    for (hub_id, zone_id), route in routes.items():
        handling_cost = hub_by_id[hub_id].handling_cost
        cost = derive_od_cost(route.distance_km, handling_cost, cost_per_km)
        new_od_matrix[(hub_id, zone_id)] = OD(
            from_id=hub_id,
            to_id=zone_id,
            distance_km=route.distance_km,
            time_min=route.time_min,
            cost=cost,
        )

    updated_model = model.model_copy(update={"od_matrix": new_od_matrix})
    return updated_model, mode
