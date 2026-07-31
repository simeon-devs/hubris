"""The live guardrail test: a real Claude model, given the 5 named agent
tools and a real question, must answer using ONLY numbers that appear in
the tool results it actually received. This is the test that would FAIL if
an agent fabricated a figure — `test_provenance.py`'s canary test proves
the checker itself would catch a fabricated number; this test proves the
checker finds nothing to catch in a real run.

Skipped without ANTHROPIC_API_KEY (same pattern as T-06's LLM-assisted
column mapping) — this hits the real API, so it's not part of the default
fast unit-test loop; run it explicitly when you have a key.
"""

import json
import os

import pytest

from hubris.agents.provenance import find_unexplained_numbers
from hubris.agents.runner import run_agent_query
from hubris.core.contracts import NetworkModel
from hubris.core.registry import AGENT_TOOL, load_plugins
from hubris.core.registry import registry as global_registry
from hubris.data.synthetic import generate_synthetic_raw_tables
from tests.fixtures.tiny_network import TINY_RAW_TABLES

pytestmark = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="requires a live ANTHROPIC_API_KEY",
)


def _named_tools():
    load_plugins()
    wanted = {
        "get_kpis",
        "find_spare_capacity",
        "simulate_scenario",
        "optimise_network",
        "compare_scenarios",
    }
    return [t for t in global_registry.all(AGENT_TOOL) if t.name in wanted]


def _assert_no_fabrication(result: dict, question: str) -> None:
    assert result["tool_calls"], "agent answered without calling any tool"
    tool_results = [json.loads(c["result"]) for c in result["tool_calls"]]
    unexplained = find_unexplained_numbers(result["answer"], tool_results, question=question)
    assert unexplained == [], (
        f"agent stated number(s) not present in any tool result: {unexplained}\n"
        f"answer: {result['answer']}"
    )


def test_simple_kpi_question_is_fully_grounded():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)
    question = "What is the current cost-to-serve per parcel for this network?"
    result = run_agent_query(model, _named_tools(), question)
    _assert_no_fabrication(result, question)


def test_optimizer_recommendation_question_is_fully_grounded():
    model = NetworkModel.from_raw_tables(generate_synthetic_raw_tables())
    question = (
        "Should we close any hubs to save cost? If so, which ones and by how "
        "much would cost-to-serve improve?"
    )
    result = run_agent_query(model, _named_tools(), question)
    _assert_no_fabrication(result, question)


def test_whatif_question_is_fully_grounded():
    model = NetworkModel.from_raw_tables(generate_synthetic_raw_tables())
    question = "What would happen to cost-to-serve if demand grew by 20% across the network?"
    result = run_agent_query(model, _named_tools(), question)
    _assert_no_fabrication(result, question)
