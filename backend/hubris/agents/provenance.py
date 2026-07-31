"""The guardrail utility for CLAUDE.md's one rule that never moves: every
number an agent states must trace back to a tool result it actually
received, not something the LLM computed or guessed itself.

`extract_numbers_from_text` pulls numeric-looking tokens out of an agent's
prose answer. `extract_numbers_from_value` walks a tool result (or a list
of them) and collects every numeric leaf value. `is_traceable` checks a
claimed number against that set with tolerance for reasonable rounding —
an agent saying "about 57 AED" for a computed 57.0949 isn't fabrication.
"""

import re

# Negative lookbehind excludes digits glued to a preceding letter (e.g. the
# "3" in hub id "H3") — those are identifiers, not numeric claims.
_NUMBER_RE = re.compile(r"(?<![A-Za-z])-?\d[\d,]*(?:\.\d+)?")


def extract_numbers_from_text(text: str) -> list[float]:
    numbers = []
    for match in _NUMBER_RE.findall(text):
        cleaned = match.replace(",", "")
        try:
            numbers.append(float(cleaned))
        except ValueError:
            continue
    return numbers


def extract_numbers_from_value(value: object) -> set[float]:
    numbers: set[float] = set()
    if isinstance(value, bool):
        return numbers
    if isinstance(value, (int, float)):
        numbers.add(float(value))
    elif isinstance(value, dict):
        for v in value.values():
            numbers |= extract_numbers_from_value(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            numbers |= extract_numbers_from_value(v)
    return numbers


def is_traceable(
    claimed: float,
    known_numbers: set[float],
    rel_tol: float = 0.02,
    abs_tol: float = 0.5,
) -> bool:
    """Is `claimed` plausibly derived from one of `known_numbers`? Allows
    for rounding (57 vs 57.0949), sign/percent framing (-11.89 vs 11.89),
    and small arithmetic combinations are NOT allowed here — only direct
    (possibly rounded) matches. Anything else counts as unexplained."""
    for known in known_numbers:
        if abs(claimed - known) <= abs_tol:
            return True
        if known != 0 and abs(claimed - known) / abs(known) <= rel_tol:
            return True
        if abs(claimed - abs(known)) <= abs_tol:  # sign framing, e.g. "-11.89% -> 11.89% saving"
            return True
        if abs(round(claimed) - round(known)) < 1e-9:  # both round to the same integer
            return True
    return False


def find_unexplained_numbers(
    text: str,
    tool_results: list[object],
    question: str | None = None,
    ignore_below: float = 3.0,
) -> list[float]:
    """Numbers in `text` that aren't traceable to any `tool_results` value
    (or, if given, to the user's own `question` — restating a number the
    user themselves provided, e.g. "a 20% demand increase" back to them
    isn't fabrication). `ignore_below` filters out small integers that are
    almost always incidental prose (list markers, "2 hubs", the digit in
    "T-08", etc.) rather than claimed metrics — real cost/utilization/count
    figures in this domain are essentially always >= 3."""
    known_numbers: set[float] = set()
    for result in tool_results:
        known_numbers |= extract_numbers_from_value(result)
    if question:
        known_numbers |= set(extract_numbers_from_text(question))

    unexplained = []
    for claimed in extract_numbers_from_text(text):
        if abs(claimed) <= ignore_below:
            continue
        if not is_traceable(claimed, known_numbers):
            unexplained.append(claimed)
    return unexplained
