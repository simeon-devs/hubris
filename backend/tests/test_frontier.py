"""Realism frontier (Sims decision 2026-08-05): unconstrained vs
resilience-constrained optimum, side by side, hand-checkable.

On CLOSE_HUB_RAW_TABLES (see its docstring): unconstrained optimum closes
H2 -> total 650. Both hubs sit in Dubai, total demand 25.

  min_hubs_per_emirate=2  -> both hubs forced open, flows route cheapest:
      transport 110 + fixed 5500 = 5610; resilience premium 4960.
  max_hub_volume_share=0.6 -> no hub may carry >15 of the 25 units, so H1
      must take >=10. Cheapest split fills H2's 15-unit cap with the
      highest-saving units (Z2's 10 at 3/u saved, then 5 of Z1 at 1/u):
      transport = 10*3 + (5*4 + 5*5) + 5*8 = 115; total 115+5500 = 5615.
"""

import pytest

from hubris.core.contracts import NetworkModel
from hubris.agents.tools.optimise_frontier import OptimiseFrontierTool
from hubris.core.registry import load_plugins
from tests.fixtures.close_hub_fixture import CLOSE_HUB_RAW_TABLES


@pytest.fixture()
def model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(CLOSE_HUB_RAW_TABLES)


def test_frontier_reports_both_sides_and_the_premium(model):
    result = OptimiseFrontierTool().run(
        model=model, min_hubs_per_emirate=2, max_hub_volume_share=1.0
    )

    unc, con = result["unconstrained"], result["constrained"]
    assert unc["objective_value"] == 650.0
    assert unc["changes"] == [{"action": "close_hub", "hub_id": "H2"}]
    assert unc["constraints_enforced"] is True

    # floor=2 forces both Dubai hubs open — which IS the baseline shape
    assert con["objective_value"] == 5610.0
    assert con["changes"] == []
    assert con["hubs_open_count"] == 2
    assert con["constraints_enforced"] is True

    assert result["resilience_premium"]["total_cost_delta"] == 4960.0
    # the labelled policy line the UI/pitch leans on
    assert "CONSTRAINED" in result["recommendation_policy"]


def test_volume_share_cap_binds_and_shares_are_reported(model):
    result = OptimiseFrontierTool().run(
        model=model, min_hubs_per_emirate=1, max_hub_volume_share=0.6
    )
    con = result["constrained"]
    assert con["objective_value"] == 5615.0  # hand math in module docstring
    shares = con["volume_share_by_hub"]
    assert shares["H2"] == pytest.approx(0.6)  # cap binds exactly
    assert shares["H1"] == pytest.approx(0.4)
    assert max(shares.values()) <= 0.6 + 1e-9


def test_emirate_floor_is_capped_by_availability(model):
    # asking for 5 hubs in a 2-facility emirate must not go infeasible —
    # the floor caps at what exists
    result = OptimiseFrontierTool().run(
        model=model, min_hubs_per_emirate=5, max_hub_volume_share=1.0
    )
    assert result["constrained"]["objective_value"] == 5610.0
    assert result["constrained"]["constraints_enforced"] is True


def test_every_frontier_point_carries_both_labelled_cost_pools(model):
    # CLOSE_HUB hand math: baseline (both open) transport 110 over 25 units
    # -> variable 4.4/parcel; +5500 fixed -> fully-loaded 5610/25 = 224.4.
    # Unconstrained (H1 only) transport 150 -> variable 6.0; fully-loaded
    # 650/25 = 26.0. Both pools present, labelled, never blended.
    result = OptimiseFrontierTool().run(
        model=model, min_hubs_per_emirate=1, max_hub_volume_share=1.0
    )
    base, unc = result["baseline"]["cost_pools"], result["unconstrained"]["cost_pools"]
    assert base["variable_only_aed_per_parcel"] == 4.4
    assert base["fully_loaded_aed_per_parcel"] == 224.4
    assert unc["variable_only_aed_per_parcel"] == 6.0
    assert unc["fully_loaded_aed_per_parcel"] == 26.0
    # consolidation moved the pools in OPPOSITE directions — the pitch point
    assert unc["variable_only_aed_per_parcel"] > base["variable_only_aed_per_parcel"]
    assert unc["fully_loaded_aed_per_parcel"] < base["fully_loaded_aed_per_parcel"]
    # the verified 7.00 target comparison is precomputed, not agent math
    from hubris.core import assumptions

    assert base["variable_target_aed"] == assumptions.value("dataset_g_variable_cost_target_aed")
    assert base["meets_variable_target"] is True and base["variable_vs_target_aed"] == -2.6
    assert unc["meets_variable_target"] is True and unc["variable_vs_target_aed"] == -1.0


def test_defaults_come_from_the_assumptions_registry(model):
    from hubris.core import assumptions

    result = OptimiseFrontierTool().run(model=model)
    assert result["params"]["min_hubs_per_emirate"] == assumptions.value(
        "frontier_min_hubs_per_emirate"
    )
    assert result["params"]["max_hub_volume_share"] == assumptions.value(
        "frontier_max_hub_volume_share"
    )


def test_frontier_on_the_real_twin_respects_both_realism_rules():
    from hubris.ingestion.dataset_g_connector import DatasetGConnector

    load_plugins()
    raw = DatasetGConnector().load("hubris/data/dataset_g.xlsx", network="hub_spoke")
    real = NetworkModel.from_raw_tables(raw)
    result = OptimiseFrontierTool().run(model=real)

    con = result["constrained"]
    assert con["constraints_enforced"] is True
    # every emirate that has a facility keeps at least one open hub
    emirates_with_facility = {h.emirate for h in real.hubs}
    open_emirates = {
        h.emirate for h in real.hubs if h.id in set(con["hubs_open"])
    }
    assert open_emirates == emirates_with_facility
    # no hub carries more than the default 40% share
    assert max(con["volume_share_by_hub"].values()) <= 0.40 + 1e-9
    # resilience costs something: constrained saves less than unconstrained
    assert (
        con["delta_vs_baseline_pct"]
        >= result["unconstrained"]["delta_vs_baseline_pct"]
    )
    # on the real twin the pools move in opposite directions under
    # consolidation: variable rises (incremental distance), loaded falls
    base_pools = result["baseline"]["cost_pools"]
    con_pools = con["cost_pools"]
    assert con_pools["variable_only_aed_per_parcel"] > base_pools["variable_only_aed_per_parcel"]
    assert con_pools["fully_loaded_aed_per_parcel"] < base_pools["fully_loaded_aed_per_parcel"]


def test_frontier_endpoint_is_reachable():
    from fastapi.testclient import TestClient

    from hubris.api.main import app

    with TestClient(app) as client:
        r = client.post(
            "/optimize/frontier",
            json={"min_hubs_per_emirate": 1, "max_hub_volume_share": 0.5},
        )
        assert r.status_code == 200
        body = r.json()
        assert set(body) >= {
            "baseline",
            "unconstrained",
            "constrained",
            "resilience_premium",
            "params",
        }
        assert body["params"]["max_hub_volume_share"] == 0.5
