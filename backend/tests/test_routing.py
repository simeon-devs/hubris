"""Tests for T-19's real drive-distance routing + fallback.

Non-live tests force the fallback path deterministically (pointing
OSRM_BASE_URL at an unreachable host, or passing use_osrm=False) so they
never depend on network access. One live-gated test (skipped if the public
OSRM demo server isn't reachable right now) proves the real integration
actually returns real road distances, not just that the fallback works.
"""

import httpx
import pytest

from hubris.core.contracts import NetworkModel
from hubris.engine.geo import haversine_km
from hubris.engine.routing import MODE_FALLBACK, MODE_OSRM, get_route_matrix, refresh_od_matrix
from tests.fixtures.tiny_network import TINY_RAW_TABLES

UNREACHABLE_URL = "http://127.0.0.1:1"


def _hub_zone_coords():
    hub_coords = [("H1", 25.2, 55.3), ("H2", 24.45, 54.4)]
    zone_coords = [("Z1", 25.1, 55.2), ("Z2", 25.3, 55.4), ("Z3", 24.5, 54.5)]
    return hub_coords, zone_coords


def test_falls_back_to_haversine_when_osrm_is_unreachable(monkeypatch):
    monkeypatch.setattr("hubris.engine.routing.OSRM_BASE_URL", UNREACHABLE_URL)
    monkeypatch.setattr("hubris.engine.routing.OSRM_TIMEOUT_SECONDS", 1.0)
    hub_coords, zone_coords = _hub_zone_coords()

    routes, mode = get_route_matrix(hub_coords, zone_coords, use_osrm=True)

    assert mode == MODE_FALLBACK
    assert len(routes) == len(hub_coords) * len(zone_coords)
    assert all(r.distance_km > 0 for r in routes.values())


def test_use_osrm_false_always_uses_fallback_without_a_network_call():
    hub_coords, zone_coords = _hub_zone_coords()
    routes, mode = get_route_matrix(hub_coords, zone_coords, use_osrm=False)
    assert mode == MODE_FALLBACK
    assert len(routes) == 6


def test_refresh_od_matrix_fallback_preserves_the_cost_formula(monkeypatch):
    monkeypatch.setattr("hubris.engine.routing.OSRM_BASE_URL", UNREACHABLE_URL)
    monkeypatch.setattr("hubris.engine.routing.OSRM_TIMEOUT_SECONDS", 1.0)
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)

    updated_model, mode = refresh_od_matrix(model, use_osrm=True)

    assert mode == MODE_FALLBACK
    assert len(updated_model.od_matrix) == 6
    od = updated_model.od_matrix[("H1", "Z1")]
    # cost = distance x Van's cost_per_km (1.5) + H1's handling_cost (2.0)
    assert od.cost == round(od.distance_km * 1.5 + 2.0, 2)
    # original model is untouched — the fixture's hand-picked cost of 10.0
    # for H1->Z1 is still there, not overwritten
    assert model.od_matrix[("H1", "Z1")].cost == 10.0


def _osrm_reachable() -> bool:
    try:
        response = httpx.get(
            "https://router.project-osrm.org/table/v1/driving/55.3,25.2;55.2,25.1", timeout=5
        )
        return response.status_code == 200
    except httpx.HTTPError:
        return False


@pytest.mark.skipif(not _osrm_reachable(), reason="public OSRM demo server is unreachable")
def test_live_osrm_table_returns_real_road_distances():
    hub_coords, zone_coords = _hub_zone_coords()

    routes, mode = get_route_matrix(hub_coords, zone_coords, use_osrm=True)

    assert mode == MODE_OSRM
    assert len(routes) == 6
    # real road distance should be at least the straight-line distance
    # (roads are never shorter than "as the crow flies"), with a small
    # tolerance for routing/rounding noise
    for hub_id, hlat, hlon in hub_coords:
        for zone_id, zlat, zlon in zone_coords:
            straight_line = haversine_km(hlat, hlon, zlat, zlon)
            assert routes[(hub_id, zone_id)].distance_km >= straight_line * 0.95
