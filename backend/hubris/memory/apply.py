"""T-39: heuristic APPLICATION — the moment the twin visibly uses what it
learned. Annotation-only, by design:

A matching active heuristic ANNOTATES the tool result (`applied_heuristics`
appended into the returned JSON) — it never changes what the engine
computes. Memory influences attention and explanation, not arithmetic:
the one rule that never moves stays intact, and a wrong heuristic can
misdirect focus but can never corrupt a number.

Verifier interplay (why this is safe inside T-33's gate): heuristic advice
is NUMBER-FREE by construction (enforced at `record_heuristic`), so the
annotation adds no numeric claims to the evidence; numeric memory lives in
engine-written FACTS whose figures carry the provenance of the run that
computed them.

Applied at every chokepoint that runs a tool: the agent adapter and the
/simulate and /optimize routers. Graceful throughout — memory down means
no annotation, never a failure.
"""

from hubris.memory.store import memory


def apply_heuristics(tool_name: str, result: dict) -> dict:
    """Append matching active heuristics to a successful tool result and
    bump their applied-counters. Returns the same dict (mutated) for
    call-site convenience. Never raises."""
    try:
        if not isinstance(result, dict) or "error" in result:
            return result
        records = memory.recall("procedural", {"tool": tool_name, "active_only": True}, limit=5)
        if not records:
            return result
        result["applied_heuristics"] = [
            {
                "name": rec.key,
                "advice": rec.content["rule"].get("then", {}).get("advise", ""),
                "rationale": rec.content.get("rationale"),
                "author": rec.content.get("author"),
                "provenance": rec.provenance,
            }
            for rec in records
        ]
        memory.bump_applied([rec.key for rec in records])
        return result
    except Exception:  # noqa: BLE001 — annotation is best-effort, always
        return result
