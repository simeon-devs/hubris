"""T-33: proves the runtime provenance gate actually gates.

These tests run WITHOUT an LLM: a scripted fake agent produces exact
transcripts (including deliberately fabricated figures), and the assertions
check what `run_verified_query` lets through. The critical property, per
Sims' build rule 1: **if an agent emits an untraceable number and the gate
passes it as verified, these tests FAIL.**

The fake messages mimic just enough of LangChain's message shapes for
`_parse_transcript`: `.content`, `.tool_calls`, and a class literally named
`ToolMessage` with `.tool_call_id`.
"""

import pytest

from hubris.agents.runner import REGENERATION_PROMPT, run_verified_query
from hubris.agents.verifier import NumericProvenanceVerifier


class _AIMessage:
    def __init__(self, content, tool_calls=None):
        self.content = content
        self.tool_calls = tool_calls or []


class ToolMessage:  # class NAME is what _parse_transcript matches on
    def __init__(self, tool_call_id, content):
        self.tool_call_id = tool_call_id
        self.content = content


class ScriptedAgent:
    """Pops one pre-built transcript per invoke; records every payload so
    tests can assert what the regeneration pass actually told the agent."""

    def __init__(self, transcripts):
        self._transcripts = list(transcripts)
        self.invocations = []

    def invoke(self, payload):
        self.invocations.append(payload)
        return {"messages": self._transcripts.pop(0)}


def _transcript(answer: str, tool_result_json: str | None = '{"cost_to_serve": 57.09}'):
    messages = []
    if tool_result_json is not None:
        messages.append(
            _AIMessage("", tool_calls=[{"id": "c1", "name": "get_kpis", "args": {}}])
        )
        messages.append(ToolMessage("c1", tool_result_json))
    messages.append(_AIMessage(answer))
    return messages


FABRICATED = "Cost-to-serve is 57.09 AED/parcel, a total saving of ~29088 AED annually."
CLEAN = "Cost-to-serve is 57.09 AED/parcel (from get_kpis)."


def test_fabricated_figure_is_caught_never_passed_as_verified():
    # Agent fabricates on BOTH passes (29088 appears in no tool result).
    agent = ScriptedAgent([_transcript(FABRICATED), _transcript(FABRICATED)])

    result = run_verified_query(agent, "What is our cost-to-serve?")

    verdict = result["verification"]
    # THE core T-33 assertion: an untraceable figure must never come back
    # as "verified". If this assertion trips, the gate is broken.
    assert verdict["status"] == "flagged"
    assert 29088.0 in verdict["untraceable_figures"]
    assert verdict["attempts"] == 2
    # The prose is still returned (policy: flag, never silently swallow) —
    # but only WITH the verdict naming the fabrication.
    assert "29088" in result["answer"]


def test_regeneration_pass_names_the_figures_and_clears_the_answer():
    agent = ScriptedAgent([_transcript(FABRICATED), _transcript(CLEAN)])

    result = run_verified_query(agent, "What is our cost-to-serve?")

    verdict = result["verification"]
    assert verdict["status"] == "regenerated"
    assert verdict["attempts"] == 2
    assert verdict["untraceable_figures"] == []
    assert result["answer"] == CLEAN

    # The second invocation must have received the correction naming the
    # exact fabricated figure — that is what makes regeneration targeted
    # rather than a blind retry.
    second_payload = agent.invocations[1]["messages"]
    correction_texts = [
        m["content"] for m in second_payload if isinstance(m, dict) and m.get("role") == "user"
    ]
    assert any("29088" in text for text in correction_texts)
    assert any(REGENERATION_PROMPT.splitlines()[0].split(".")[0] in text for text in correction_texts)


def test_clean_answer_verifies_on_the_first_pass_without_regeneration():
    agent = ScriptedAgent([_transcript(CLEAN)])

    result = run_verified_query(agent, "What is our cost-to-serve?")

    verdict = result["verification"]
    assert verdict["status"] == "verified"
    assert verdict["attempts"] == 1
    assert verdict["untraceable_figures"] == []
    assert verdict["checked_against"] == ["get_kpis"]
    assert len(agent.invocations) == 1  # no wasted second LLM round-trip


def test_numeric_claims_with_no_tool_calls_at_all_are_flagged():
    # An agent that answers with figures without calling ANY tool has, by
    # definition, invented them.
    agent = ScriptedAgent(
        [
            _transcript("Utilization is around 84.7 percent.", tool_result_json=None),
            _transcript("Utilization is around 84.7 percent.", tool_result_json=None),
        ]
    )

    result = run_verified_query(agent, "How utilized are we?")

    assert result["verification"]["status"] == "flagged"
    assert 84.7 in result["verification"]["untraceable_figures"]


def test_restating_the_users_own_number_is_not_fabrication():
    agent = ScriptedAgent(
        [_transcript("Under a 20% demand increase, cost-to-serve is 57.09 AED (get_kpis).")]
    )

    result = run_verified_query(agent, "What happens under a 20% demand increase?")

    assert result["verification"]["status"] == "verified"


@pytest.mark.parametrize(
    "scripts",
    [
        [_transcript(CLEAN)],
        [_transcript(FABRICATED), _transcript(CLEAN)],
        [_transcript(FABRICATED), _transcript(FABRICATED)],
    ],
)
def test_every_result_carries_a_verdict(scripts):
    # There is no unverified return path: whatever the agent does, the
    # result has a verification block with a legal status.
    result = run_verified_query(ScriptedAgent(scripts), "q")
    assert result["verification"]["status"] in {"verified", "regenerated", "flagged"}


def test_verifier_unit_verified_and_flagged():
    verifier = NumericProvenanceVerifier()

    ok = verifier.verify("Cost is 57.09 AED.", [{"cost": 57.0949}])
    assert ok.status == "verified" and ok.untraceable_figures == []

    bad = verifier.verify("Cost is 999.5 AED.", [{"cost": 57.0949}])
    assert bad.status == "flagged" and bad.untraceable_figures == [999.5]
