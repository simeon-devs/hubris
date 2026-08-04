"""T-33: the runtime provenance gate's concrete verifier.

Wraps `provenance.find_unexplained_numbers` (which existed since T-11 but —
per the STATUS.md audit — was only ever called from tests) behind the
`ProvenanceVerifier` contract, so `runner.run_agent_query` can enforce
CLAUDE.md's one rule at runtime instead of merely requesting it in the
system prompt. Deterministic, pure-Python, no LLM involved — the checker
itself can never fabricate or hallucinate a pass.
"""

from hubris.agents.provenance import find_unexplained_numbers
from hubris.core.contracts import ProvenanceVerifier, VerificationVerdict


class NumericProvenanceVerifier(ProvenanceVerifier):
    """Single-pass check: every numeric claim in `answer` must trace to a
    value in `tool_results` (or the user's own `question`). Returns
    "verified" or "flagged" for THIS pass; the regenerate-once policy and
    the final three-state verdict live in the runner's loop."""

    def verify(
        self,
        answer: str,
        tool_results: list[object],
        question: str | None = None,
    ) -> VerificationVerdict:
        unexplained = find_unexplained_numbers(answer, tool_results, question=question)
        return VerificationVerdict(
            status="verified" if not unexplained else "flagged",
            untraceable_figures=unexplained,
            attempts=1,
        )
