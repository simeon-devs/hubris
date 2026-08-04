"""Proves the anti-fabrication checker (hubris/agents/provenance.py) itself
has teeth: it must accept legitimately-rounded numbers and REJECT a number
that doesn't trace back to any tool result. This doesn't need a live LLM —
it's the guarantee that `test_agent_no_fabrication.py`'s live check is
actually checking something, not trivially passing.
"""

from hubris.agents.provenance import extract_numbers_from_text, find_unexplained_numbers, is_traceable


def test_extract_numbers_from_text():
    text = "Cost-to-serve is 57.09 AED/parcel, down 11.89% versus 1,234 baseline."
    assert extract_numbers_from_text(text) == [57.09, 11.89, 1234.0]


def test_provenance_run_ids_are_never_numeric_claims():
    # Live-found (T-39): quoting the run id that PROVES provenance must not
    # itself be flagged as fabrication.
    text = "Source: engine computation from run `find_demand_growth_break:15be3c67c762`."
    assert extract_numbers_from_text(text) == []
    assert find_unexplained_numbers(text, [{"growth_pct": 172.66}]) == []


def test_identifier_stripping_keeps_real_numeric_claims():
    text = "Hub H5 breaks at 172.66% (run 15be3c67c762), costing 57.09 AED."
    assert extract_numbers_from_text(text) == [172.66, 57.09]


def test_rounded_number_is_traceable():
    assert is_traceable(57.09, {57.0949})
    assert is_traceable(57, {57.0949})  # both round to 57


def test_sign_framed_percentage_is_traceable():
    # optimiser reports delta as -11.89 (a cost decrease); an agent saying
    # "an 11.89% saving" is describing the same number, not fabricating.
    assert is_traceable(11.89, {-11.89})


def test_fabricated_number_is_not_traceable():
    known = {57.0949, 30.0, 100.0, -11.89}
    assert not is_traceable(999999.99, known)
    assert not is_traceable(12.5, known)  # close to nothing in particular


def test_find_unexplained_numbers_flags_a_fabricated_figure():
    tool_results = [
        {"name": "cost_to_serve", "value": 57.0949, "unit": "AED/parcel"},
        {"changes": [{"action": "close_hub", "hub_id": "H1"}], "objective_value": 215449.92},
    ]
    # Real numbers (57.09, 215449.92) plus one the agent made up (999999.99).
    text = (
        "The cost-to-serve is 57.09 AED/parcel. After optimising, total cost "
        "is 215449.92, saving the network 999999.99 AED overall."
    )

    unexplained = find_unexplained_numbers(text, tool_results)
    assert unexplained == [999999.99]


def test_find_unexplained_numbers_accepts_a_fully_grounded_answer():
    tool_results = [{"name": "cost_to_serve", "value": 57.0949, "unit": "AED/parcel"}]
    text = "The current cost-to-serve is about 57.09 AED per parcel."

    assert find_unexplained_numbers(text, tool_results) == []


def test_find_unexplained_numbers_ignores_small_incidental_numbers():
    tool_results = [{"name": "cost_to_serve", "value": 57.0949}]
    text = "Across the 2 hubs I checked, cost-to-serve is 57.09 AED/parcel."

    assert find_unexplained_numbers(text, tool_results) == []


def test_find_unexplained_numbers_allows_restating_the_users_own_question():
    # "20%" only appears because the user asked about it — restating it
    # back isn't the agent fabricating a figure.
    tool_results = [{"name": "cost_to_serve", "value": 52.74}]
    question = "What happens to cost-to-serve if demand grew by 20%?"
    text = "With a 20% demand increase, cost-to-serve would be 52.74 AED/parcel."

    assert find_unexplained_numbers(text, tool_results, question=question) == []
    # without the question for context, 20.0 is correctly flagged as ungrounded
    assert find_unexplained_numbers(text, tool_results) == [20.0]
