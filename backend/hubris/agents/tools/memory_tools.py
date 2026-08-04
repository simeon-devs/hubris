"""T-39: the agent-facing memory tools — how the twin's learning becomes
user-visible through the EXISTING chat.

`recall_memory` — "have we tried this before? what do we know about H5?"
answered from recorded episodes, engine-written facts, and heuristics.
Recalled numbers are legitimate evidence for the T-33 verifier: every one
was engine-computed in a previous run and carries that run's provenance.

`record_heuristic` — the agent-writable block (CLAUDE.md §4). Provenance
is stamped automatically. The advice/rationale must be NUMBER-FREE: a
heuristic directs future attention ("check H5's robustness band first
under demand growth"); numeric findings belong in FACTS, which only the
engine writes with computed values. This is what keeps memory from
becoming a fabrication loophole — an agent cannot launder an invented
figure into future runs' evidence via a stored heuristic.
"""

from hubris.agents.provenance import extract_numbers_from_text
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool
from hubris.memory.store import memory, new_provenance

# Same materiality floor as the verifier: tiny incidental integers ("2
# hubs", "step 3") are prose, not numeric claims.
_MATERIAL_NUMBER_FLOOR = 3.0


@register_agent_tool
class RecallMemoryTool(AgentTool):
    name = "recall_memory"
    description = (
        "Recall what the twin has learned across sessions. kind='episodic' "
        "(past scenario/optimiser runs and their recorded KPIs — answers "
        "'have we tried this before?'; filter with scenario_name), "
        "kind='semantic' (facts the ENGINE recorded from real computations, "
        "e.g. a hub's measured demand-growth break point; filter with "
        "key_prefix like 'hub.H5.'), kind='procedural' (stored heuristics; "
        "filter with tool). Returns records with provenance — every number "
        "in them was engine-computed in the run named by its provenance, so "
        "you may cite them directly. If available=false, memory is "
        "unreachable: say so and answer from current tools only."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "kind": {"type": "string", "description": "episodic | semantic | procedural"},
            "scenario_name": {"type": "string", "description": "episodic filter"},
            "key_prefix": {"type": "string", "description": "semantic filter, e.g. 'hub.H5.'"},
            "tool": {"type": "string", "description": "procedural filter: heuristics for this tool"},
            "limit": {"type": "integer"},
        },
        "required": ["kind"],
    }

    def run(
        self,
        *,
        model: NetworkModel,
        kind: str,
        scenario_name: str | None = None,
        key_prefix: str | None = None,
        tool: str | None = None,
        limit: int = 10,
        **_: object,
    ) -> dict:
        query: dict = {}
        if scenario_name:
            query["scenario_name"] = scenario_name
        if key_prefix:
            query["key_prefix"] = key_prefix
        if tool:
            query["tool"] = tool
        available = memory.available()
        records = memory.recall(kind, query, limit) if available else []
        return {
            "available": available,
            "kind": kind,
            "records": [r.model_dump() for r in records],
            "total_returned": len(records),
        }


@register_agent_tool
class RecordHeuristicTool(AgentTool):
    name = "record_heuristic"
    description = (
        "Store a decision heuristic the twin should APPLY in later sessions: "
        "whenever the named tool runs in future, your advice is attached to "
        "its result for that run's agent and planner to see. Use this when a "
        "computed result reveals a durable pattern worth remembering (e.g. "
        "which hub to scrutinise first under demand growth). advice and "
        "rationale must be NUMBER-FREE — direct attention, don't state "
        "figures; numeric findings are recorded as facts by the engine "
        "itself and recalled via recall_memory(kind='semantic'). Provenance "
        "is stamped automatically."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "short unique kebab-case name"},
            "when_tool": {
                "type": "string",
                "description": "the registered tool name this applies to, e.g. 'optimise_network'",
            },
            "advice": {"type": "string", "description": "number-free guidance for future runs"},
            "rationale": {"type": "string", "description": "number-free why, for the planner"},
            "author": {"type": "string", "description": "who is recording this (your role name)"},
        },
        "required": ["name", "when_tool", "advice", "rationale"],
    }

    def run(
        self,
        *,
        model: NetworkModel,
        name: str,
        when_tool: str,
        advice: str,
        rationale: str,
        author: str = "agent",
        **_: object,
    ) -> dict:
        material = [
            n
            for n in extract_numbers_from_text(f"{advice} {rationale}")
            if abs(n) > _MATERIAL_NUMBER_FLOOR
        ]
        if material:
            return {
                "recorded": False,
                "error": (
                    f"advice/rationale contain figures {material} — heuristics must be "
                    "number-free (numbers live in engine-written facts; recall them with "
                    "recall_memory kind='semantic'). Rephrase without figures and retry."
                ),
            }
        heuristic_id = memory.record_heuristic(
            name=name,
            rule={"when": {"tool": when_tool}, "then": {"advise": advice}},
            rationale=rationale,
            author=author,
            provenance=new_provenance(f"agent:record_heuristic:{author}"),
        )
        if heuristic_id is None:
            return {"recorded": False, "error": "memory unavailable — heuristic not stored"}
        return {
            "recorded": True,
            "heuristic_id": heuristic_id,
            "name": name,
            "applies_to_tool": when_tool,
            "note": "will be attached to that tool's results in future runs until retired",
        }
