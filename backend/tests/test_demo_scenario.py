"""Tests for T-30's always-renders seeded demo scenario.

The whole point of this scenario is that it cannot fail mid-demo
(BUILD_SPEC §13), so these assert the two properties that matter: it
seeds successfully and stays feasible on the real synthetic dataset, and
it degrades to None (never raises) when it can't be built.
"""

from hubris.api.state import AppState, seed_demo_scenario
from hubris.core.registry import load_plugins
from hubris.data.demo_scenario import (
    DEMO_SCENARIO_ID,
    DEMO_TARGET_EMIRATE,
    demo_scenario_params,
)
from hubris.engine.bottleneck import find_cheapest_bottleneck_unlock
from hubris.engine.flow import solve_min_cost_flow
from hubris.engine.opportunities import scan_opportunities


def test_demo_scenario_params_scope_to_the_target_emirate_when_present():
    params = demo_scenario_params({DEMO_TARGET_EMIRATE, "Dubai"})
    assert params["emirate"] == DEMO_TARGET_EMIRATE
    assert params["factor"] > 1.0


def test_demo_scenario_params_fall_back_to_network_wide_when_emirate_absent():
    # An ingested real dataset may not have this emirate at all — the
    # scenario must still be buildable, not reference a missing emirate.
    params = demo_scenario_params({"Some Other Region"})
    assert params["emirate"] is None


def test_seed_demo_scenario_seeds_a_feasible_scenario_on_the_synthetic_dataset():
    load_plugins()
    app_state = AppState()

    scenario_id = seed_demo_scenario(app_state)

    assert scenario_id == DEMO_SCENARIO_ID
    assert DEMO_SCENARIO_ID in app_state.scenarios
    assert app_state.scenario_labels[DEMO_SCENARIO_ID]  # a human-readable label exists

    # Always-renders guarantee: demand is fully served, so no view can
    # show unmet demand or a blank map mid-demo.
    model = app_state.get_model(DEMO_SCENARIO_ID)
    assert solve_min_cost_flow(model).feasible is True


def test_seeded_demo_scenario_makes_every_signature_feature_fire():
    # The reason this scenario is a surge rather than the pristine
    # baseline: on the untouched baseline the bottleneck unlock honestly
    # reports nothing binding and far-hub-service is empty.
    load_plugins()
    app_state = AppState()
    seed_demo_scenario(app_state)
    model = app_state.get_model(DEMO_SCENARIO_ID)

    opportunities = scan_opportunities(model)
    assert opportunities["inefficiency_types_found"] == 3  # all three types have something to say
    assert opportunities["far_hub_service"]

    bottleneck = find_cheapest_bottleneck_unlock(model)
    assert bottleneck["bottleneck_found"] is True
    assert bottleneck["recommendation"]["verified_cost_savings"] > 0


def test_seed_demo_scenario_returns_none_instead_of_raising_on_a_broken_state():
    # A demo seed that raises would stop the app booting. Force a failure
    # (a state whose baseline has no zones at all) and confirm it degrades.
    load_plugins()
    app_state = AppState()
    app_state.baseline = app_state.baseline.model_copy(update={"zones": [], "demand": {}})

    result = seed_demo_scenario(app_state)

    assert result is None
    assert DEMO_SCENARIO_ID not in app_state.scenarios
