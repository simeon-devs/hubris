"""Hand-checkable tests for T-24's auto decision-brief: pure orchestration
over already-tested tools (T-09's optimiser, T-20's robustness band, T-23's
bottleneck unlock), so this just confirms the aggregation is faithful to
those tools' own (already hand-checked elsewhere) numbers — no new
computation to re-derive here.
"""

from hubris.agents.decision_brief import generate_decision_brief
from hubris.core.contracts import NetworkModel
from hubris.core.registry import load_plugins
from tests.fixtures.close_hub_fixture import CLOSE_HUB_RAW_TABLES
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    load_plugins()
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def test_decision_brief_aggregates_the_known_tiny_fixture_baseline():
    brief = generate_decision_brief(_model())

    # T-07's own hand-checked cost-to-serve for this fixture.
    assert brief["current_state"]["cost_to_serve"] == round(2600 / 60, 4)
    # T-09's own hand-checked result: nothing to change, already optimal.
    assert brief["proposed_change"]["changes"] == []
    assert brief["proposed_change"]["objective_value"] == 2600.0
    assert brief["cost_risk"]["cost_to_serve_savings_per_parcel"] == 0.0
    # T-20's robustness band, ample capacity -> always feasible.
    assert brief["sensitivity"]["holds_under_variation"] is True
    assert brief["sensitivity"]["demand_variation_pct"] == 20.0
    # T-23: nothing binding on this ample-capacity fixture.
    assert brief["what_it_unblocks"] is None
    assert "generated_at" in brief


def test_decision_brief_summary_cites_only_numbers_present_in_the_data():
    brief = generate_decision_brief(_model())
    summary = brief["summary"]

    assert "already optimal" in summary
    assert str(brief["cost_risk"]["cost_to_serve_before"]) in summary
    assert str(brief["sensitivity"]["cost_to_serve_p10"]) in summary
    assert str(brief["sensitivity"]["cost_to_serve_p90"]) in summary
    assert "no bottleneck to unlock" in summary


def test_decision_brief_reflects_a_real_recommended_change():
    # T-09's own hand-checked fixture: closing H2 (dominant fixed cost) is
    # clearly optimal (objective_value=650.0 vs 5610.0 with both open).
    load_plugins()
    model = NetworkModel.from_raw_tables(CLOSE_HUB_RAW_TABLES)

    brief = generate_decision_brief(model)

    assert brief["proposed_change"]["changes"] == [{"action": "close_hub", "hub_id": "H2"}]
    assert brief["proposed_change"]["objective_value"] == 650.0
    assert "close hub H2" in brief["summary"]
    assert brief["cost_risk"]["cost_to_serve_savings_per_parcel"] > 0
