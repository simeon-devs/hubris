"""Tests for T-14's Agent Builder.

Structural tests (no LLM, always run): unknown tools/autonomy modes are
rejected at creation time, the 3 seed templates all reference real
registered tools, and — the core guarantee — a created agent's tool subset
is mechanically restricted to exactly what it was allowed, regardless of
what else is registered.

Live test (skipped without ANTHROPIC_API_KEY): the fully-capable
`cost_advisor` template answers a real question using only tool-derived
numbers.
"""

import json
import os

import pytest

from hubris.agents.builder import (
    AgentBuilder,
    CustomAgentSpec,
    UnknownToolError,
    builder,
    seed_default_templates,
)
from hubris.agents.provenance import find_unexplained_numbers
from hubris.core.contracts import NetworkModel
from hubris.core.registry import load_plugins
from hubris.data.synthetic import generate_synthetic_raw_tables


def test_create_rejects_an_unknown_tool_name():
    load_plugins()
    fresh = AgentBuilder()
    with pytest.raises(UnknownToolError):
        fresh.create(
            CustomAgentSpec(
                name="bad_agent", goal="test", allowed_tools=["not_a_real_tool"]
            )
        )


def test_create_rejects_an_unknown_autonomy_mode():
    load_plugins()
    fresh = AgentBuilder()
    with pytest.raises(ValueError):
        fresh.create(
            CustomAgentSpec(
                name="bad_agent",
                goal="test",
                allowed_tools=["get_kpis"],
                autonomy="sentient",
            )
        )


def test_seed_default_templates_registers_three_real_templates():
    load_plugins()
    seed_default_templates()

    names = {spec.name for spec in builder.all()}
    assert {"capacity_watchdog", "cost_advisor", "whatif_explorer"} <= names

    # every template's tools are real, registered agent tools
    available = {"get_kpis", "find_spare_capacity", "simulate_scenario", "optimise_network", "compare_scenarios"}
    for spec in builder.all():
        assert set(spec.allowed_tools) <= available


def test_created_agent_can_only_use_the_tools_it_was_allowed():
    load_plugins()
    fresh = AgentBuilder()
    fresh.create(
        CustomAgentSpec(
            name="spare_capacity_only",
            goal="Only ever discuss spare capacity.",
            allowed_tools=["find_spare_capacity"],
        )
    )

    tools = fresh.tools_for("spare_capacity_only")
    assert {t.name for t in tools} == {"find_spare_capacity"}
    # in particular, it was never even given a tool that could answer a
    # cost question — this is enforced by construction, not by hoping the
    # LLM declines.
    assert "get_kpis" not in {t.name for t in tools}
    assert "optimise_network" not in {t.name for t in tools}


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="requires a live ANTHROPIC_API_KEY")
def test_seeded_cost_advisor_answers_a_real_question_using_only_tool_numbers():
    load_plugins()
    seed_default_templates()

    model = NetworkModel.from_raw_tables(generate_synthetic_raw_tables())
    question = "What's our cost-to-serve, and could we save money by closing any hubs?"
    result = builder.run("cost_advisor", model, question)

    assert result["tool_calls"], "cost_advisor answered without calling any tool"
    called_tools = {c["tool"] for c in result["tool_calls"]}
    assert called_tools <= {"get_kpis", "optimise_network"}  # never exceeded its allowance

    tool_results = [json.loads(c["result"]) for c in result["tool_calls"]]
    assert result["verification"]["status"] in {"verified", "regenerated"}, result["verification"]
    unexplained = find_unexplained_numbers(result["answer"], tool_results, question=question)
    assert unexplained == [], f"unexplained numbers: {unexplained}\nanswer: {result['answer']}"
