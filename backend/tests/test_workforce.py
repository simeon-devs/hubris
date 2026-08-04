"""Tests for T-12's multi-agent workforce graph.

Structural tests (no LLM, always run): every role's tool subset references
real registered tools, and unknown/garbled router output falls back to a
safe default role rather than crashing the graph.

Live tests (skipped without ANTHROPIC_API_KEY): a real question actually
gets routed to the expected specialist and answered using only tool-derived
numbers — same no-fabrication check as T-11, now proving it holds across
the routing layer too.
"""

import json
import os

import pytest

from hubris.agents.provenance import find_unexplained_numbers
from hubris.agents.workforce import (
    DEFAULT_ROLE,
    ROLE_GOALS,
    ROLE_TOOLS,
    _route_node,
    run_workforce_query,
)
from hubris.core.contracts import NetworkModel
from hubris.core.registry import AGENT_TOOL, load_plugins
from hubris.core.registry import registry as global_registry
from hubris.data.synthetic import generate_synthetic_raw_tables
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def test_every_role_has_a_goal_description():
    assert set(ROLE_TOOLS.keys()) == set(ROLE_GOALS.keys())


def test_role_tools_reference_real_registered_tool_names():
    load_plugins()
    registered_names = {t.name for t in global_registry.all(AGENT_TOOL)}
    for role, tool_names in ROLE_TOOLS.items():
        assert tool_names <= registered_names, f"{role} references unregistered tools"


def test_unknown_classification_falls_back_to_default_role():
    node = _route_node(lambda question: "not_a_real_role")
    result = node({"question": "anything", "role": "", "answer": "", "tool_calls": []})
    assert result["role"] == DEFAULT_ROLE


def test_valid_classification_is_passed_through():
    node = _route_node(lambda question: "cost_analyst")
    result = node({"question": "anything", "role": "", "answer": "", "tool_calls": []})
    assert result["role"] == "cost_analyst"


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="requires a live ANTHROPIC_API_KEY")
def test_cost_question_routes_to_cost_analyst_and_is_grounded():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)
    question = "What is our current cost-to-serve, and what's driving it — transport or fixed cost?"
    result = run_workforce_query(model, question)

    assert result["role"] == "cost_analyst"
    assert result["tool_calls"], "specialist answered without calling any tool"
    assert result["verification"]["status"] in {"verified", "regenerated"}, result["verification"]
    tool_results = [json.loads(c["result"]) for c in result["tool_calls"]]
    unexplained = find_unexplained_numbers(result["answer"], tool_results, question=question)
    assert unexplained == [], f"unexplained numbers: {unexplained}\nanswer: {result['answer']}"


@pytest.mark.skipif(not os.environ.get("ANTHROPIC_API_KEY"), reason="requires a live ANTHROPIC_API_KEY")
def test_optimizer_question_routes_to_optimizer_and_is_grounded():
    model = NetworkModel.from_raw_tables(generate_synthetic_raw_tables())
    question = "Should we close any hubs to reduce cost, and what's the expected saving?"
    result = run_workforce_query(model, question)

    assert result["role"] == "optimizer"
    assert result["tool_calls"], "specialist answered without calling any tool"
    assert result["verification"]["status"] in {"verified", "regenerated"}, result["verification"]
    tool_results = [json.loads(c["result"]) for c in result["tool_calls"]]
    unexplained = find_unexplained_numbers(result["answer"], tool_results, question=question)
    assert unexplained == [], f"unexplained numbers: {unexplained}\nanswer: {result['answer']}"
