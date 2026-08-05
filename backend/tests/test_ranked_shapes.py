"""Ranked shapes — every row a REAL engine evaluation (Sims: 'the ranked
shapes has to be there but on real data'). Hand-checkable on the 2-hub
fixture, property-checked on the real twin, reachable over the API."""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.core.registry import load_plugins
from hubris.engine.ranked_shapes import rank_network_shapes
from tests.fixtures.close_hub_fixture import CLOSE_HUB_RAW_TABLES


def test_hand_checkable_ranking_on_the_fixture():
    load_plugins()
    model = NetworkModel.from_raw_tables(CLOSE_HUB_RAW_TABLES)
    result = rank_network_shapes(model, limit=8)

    # shapes: current, close H1, close H2 — dedup keeps 3
    assert result["evaluated"] == 3
    top = result["shapes"][0]
    # hand math (fixture docstring): closing H2 -> total 650/day, the winner
    assert top["closes"] == ["H2"] and top["aed_day"] == 650.0
    current = next(r for r in result["shapes"] if r["is_current"])
    assert current["aed_day"] == 5610.0
    # savings computed vs CURRENT by the engine: (5610-650)*30
    assert top["save_aed_month"] == pytest.approx((5610.0 - 650.0) * 30)
    # closing H1 alone is infeasible-cheap? H2 cap 100 vs demand 25 - feasible;
    # every row carries its feasibility verbatim
    assert all("feasible" in r and "stress_safe_pct" in r for r in result["shapes"])


def test_real_twin_properties_and_endpoint():
    from fastapi.testclient import TestClient

    from hubris.api.main import app

    with TestClient(app) as client:  # boots the real twin
        r = client.get("/optimize/ranked-shapes", params={"limit": 8})
        assert r.status_code == 200
        body = r.json()
        # 1 current + 10 closes + 3 opens + up to 2 frontier shapes (deduped)
        assert body["evaluated"] >= 14
        shapes = body["shapes"]
        assert len(shapes) == 8
        # ranked: feasible rows ascending by cost/day
        feasible = [s for s in shapes if s["feasible"]]
        assert [s["aed_day"] for s in feasible] == sorted(s["aed_day"] for s in feasible)
        # the recommendation row is the frontier's constrained optimum
        assert any(s["is_recommended"] for s in shapes)
        rec = next(s for s in shapes if s["is_recommended"])
        assert rec["feasible"] is True and rec["stress_safe_pct"] > 0
        assert any(s["is_current"] for s in shapes)
