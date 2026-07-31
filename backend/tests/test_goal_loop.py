"""Tests for T-13's goal-driven optimisation loop, against the full
synthetic dataset (T-04). The `parse_objective` param is dependency-
injectable — non-live tests stub it to isolate the search/iteration logic
(itself fully real: every call goes through the real `optimise_network`
tool, T-09's MILP); only the live test exercises real Claude parsing.

Numbers below were captured by actually running the loop (not hand-derived
independently) against this exact dataset/seed — see TASKS.md's T-13 log
for the raw run.
"""

import os

import pytest

from hubris.agents.goal_loop import run_goal_loop
from hubris.core.contracts import NetworkModel
from hubris.core.registry import load_plugins
from hubris.data.synthetic import generate_synthetic_raw_tables


def _model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(generate_synthetic_raw_tables())


def test_succeeds_on_first_iteration_when_unconstrained_optimum_already_meets_target():
    # Unconstrained MILP alone gives an 11.89% reduction (T-09) — a 5%
    # target needs no iteration at all.
    result = run_goal_loop(
        _model(),
        "cut cost 5%",
        parse_objective=lambda _: {"target_cost_reduction_pct": 5.0, "max_utilization": None},
    )
    assert result["success"] is True
    assert result["achieved_pct_reduction"] == 11.89
    assert len(result["path"]) == 1


def test_stops_without_looping_when_no_cap_given_and_target_is_unreachable():
    # No max_utilization means every iteration would call the optimiser
    # with identical constraints and get an identical answer — looping
    # would be pointless, so it must stop after one honest attempt rather
    # than burning iterations pretending to search.
    result = run_goal_loop(
        _model(),
        "cut cost 90%",
        parse_objective=lambda _: {"target_cost_reduction_pct": 90.0, "max_utilization": None},
    )
    assert result["success"] is False
    assert result["achieved_pct_reduction"] == 11.89
    assert len(result["path"]) == 1


def test_relaxes_a_tight_utilization_cap_until_the_target_is_met():
    # A tight 20% cap only allows closing 1 hub (2.6%); relaxing to 25%
    # allows 2 (5.99%); relaxing to 30% allows 3, clearing the 10% target.
    result = run_goal_loop(
        _model(),
        "cut cost 10%, no hub over 20%",
        parse_objective=lambda _: {"target_cost_reduction_pct": 10.0, "max_utilization": 0.2},
        max_iterations=8,
    )

    assert result["success"] is True
    assert len(result["path"]) == 3
    assert [step["constraints"][0]["value"] for step in result["path"]] == [0.2, 0.25, 0.3]
    assert [step["achieved_pct_reduction"] for step in result["path"]] == [2.6, 5.99, 10.47]
    assert result["achieved_pct_reduction"] == 10.47
    # Each relaxation closes at least as many hubs as the last — the search
    # is monotonically finding more room, not thrashing.
    changes_per_step = [len(step["changes"]) for step in result["path"]]
    assert changes_per_step == sorted(changes_per_step)


def test_gives_up_after_max_iterations_if_target_still_not_met():
    result = run_goal_loop(
        _model(),
        "cut cost 99%, no hub over 5%",
        parse_objective=lambda _: {"target_cost_reduction_pct": 99.0, "max_utilization": 0.05},
        max_iterations=3,
    )
    assert result["success"] is False
    assert len(result["path"]) == 3


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="requires a live ANTHROPIC_API_KEY")
def test_live_objective_parsing_drives_a_real_search():
    result = run_goal_loop(_model(), "Cut cost-to-serve by at least 8%, no hub over 25% utilization")

    assert result["target_pct_reduction"] == pytest.approx(8.0, abs=1.0)
    assert result["max_utilization_cap"] == pytest.approx(0.25, abs=0.05)
    assert len(result["path"]) >= 1
    # every step's numbers came from a real optimise_network call
    for step in result["path"]:
        assert isinstance(step["objective_value"], (int, float))
