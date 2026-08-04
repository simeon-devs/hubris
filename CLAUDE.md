# CLAUDE.md — working context for AI contributors

> Read this before writing any code in this repo. It applies to Claude Code and any other AI asked to analyse or extend the project.
> For the *why*, read `VISION.md`; for the *what*, `BUILD_SPEC.md`; for the *how it connects*, `ARCHITECTURE.md`.

---

## 1. What you are building

Hubris — a **network digital twin** for EMX (7X's logistics arm), track: Predictive Network Optimisation. A web app for EMX planners that unifies siloed network data, simulates changes safely, and recommends + explains the optimal network shape. A deterministic OR engine computes; a LangGraph agent layer orchestrates and explains.

## 2. The one rule that never moves

**Agents orchestrate and explain. The deterministic engine computes. No agent ever invents a number.**

Every figure an agent reports must come from a tool call that ran real code. This is enforced at **three** layers, and all three are mandatory:

1. **Structural** — the agent can only obtain numbers by calling a tool; tools return structured JSON from the engine. The LLM never sees raw tables.
2. **Instructional** — the system prompt forbids arithmetic, estimation, and recomputation (`agents/runner.py`).
3. **Verification (runtime)** — every answer is checked against the actual tool results it received, *before* it reaches the API response. Any number in the prose that is not traceable to a tool result is caught, and the answer is regenerated or flagged. See §4's `ProvenanceVerifier` contract.

> **Layer 3 is not optional, and layers 1–2 are not sufficient without it.**
> This was measured, not assumed: with layers 1–2 only, a seeded agent fabricated a
> figure in **3 of 5 consecutive live runs** — it multiplied two real tool numbers
> together and presented the product ("~29,088 AED annually") as fact. A prompt is a
> request, not a guarantee. See `STATUS.md`.

When you build an agent or a tool:
- The tool returns structured JSON from the engine.
- The agent is instructed to reference tool outputs and must not emit numeric claims that aren't present in a tool result.
- **The answer passes through the verifier before anyone sees it.** Never add a code path that returns agent prose to a user without verification.
- If you catch yourself letting the LLM estimate a cost, utilisation, distance, or saving — stop. Route it through the engine.
- If a planner legitimately needs a derived figure (a total, a ratio, a delta), **add a tool that returns it directly**. Do not relax the rule to let the agent do the arithmetic.

Breaking this rule loses the single most important scoring criterion (AI Implementation Quality). It is non-negotiable.

## 3. Priority order (do not invert)

Engine that computes → agents that call it → features on top → accuracy → polish.
A plain thing that computes beats a beautiful thing that fakes it. If time is short, cut from the *stretch* tier up, never from the core.

## 4. The plugin contracts (the keystone)

Everything extensible implements one of these interfaces (in `backend/hubris/core/contracts.py`). Implement the interface, register it, and the rest of the system — including every agent — can use it. This is how the team builds in parallel.

```python
from abc import ABC, abstractmethod
from typing import Any
from pydantic import BaseModel

# ---- shared value objects ----
class NetworkModel(BaseModel):
    """The unified twin state. Treated as immutable per scenario."""
    hubs: list["Hub"]
    zones: list["Zone"]
    fleet_types: list["FleetType"]
    demand: dict[str, float]              # zone_id -> demand
    od_matrix: dict[tuple[str, str], "OD"]
    assignments: dict[str, str] | None    # zone_id -> hub_id

class MetricResult(BaseModel):
    name: str
    value: float | dict
    unit: str
    breakdown: dict | None = None         # e.g. per-emirate, per-hub

class Recommendation(BaseModel):
    changes: list[dict]                   # e.g. [{"action":"close_hub","hub_id":"H3"}]
    objective_value: float
    delta_vs_baseline: dict               # {"cost_to_serve_pct": -5.2, ...}
    rationale: dict                       # drivers, binding constraints, duals

# ---- extension points ----
class DataConnector(ABC):
    name: str
    @abstractmethod
    def can_handle(self, source: Any) -> float: ...       # confidence 0..1
    @abstractmethod
    def load(self, source: Any) -> "RawTables": ...        # -> canonical-ready tables

class Metric(ABC):
    name: str
    unit: str
    @abstractmethod
    def compute(self, model: NetworkModel, scenario_id: str | None) -> MetricResult: ...

class ScenarioModule(ABC):
    name: str                              # e.g. "move_hub"
    params_schema: dict                    # JSON schema for params
    @abstractmethod
    def apply(self, model: NetworkModel, params: dict) -> NetworkModel: ...
    # MUST return a modified COPY; never mutate the input model.

class OptimizerStrategy(ABC):
    name: str                              # e.g. "milp_cflp", "greedy"
    @abstractmethod
    def optimize(self, model: NetworkModel, objective: dict,
                 constraints: list[dict]) -> Recommendation: ...

class AgentTool(ABC):
    name: str
    description: str                       # what the agent sees; be precise
    input_schema: dict
    @abstractmethod
    def run(self, **kwargs) -> dict: ...    # returns COMPUTED JSON only
```

### The verification contract (W1 — existential)

```python
class VerificationVerdict(BaseModel):
    """Attached to EVERY agent answer before it leaves the backend."""
    status: str                            # "verified" | "flagged" | "regenerated"
    untraceable_figures: list[float]       # numbers in the prose with no tool source
    attempts: int                          # how many regeneration passes were used
    checked_against: list[str]             # tool names whose results were the evidence

class ProvenanceVerifier(ABC):
    """Wraps an agent run. The ONLY sanctioned path from LLM prose to a user."""
    @abstractmethod
    def verify(self, answer: str, tool_results: list[dict],
               question: str | None = None) -> VerificationVerdict: ...
```

Policy: on `flagged`, **regenerate once** with the offending figures named back to the
agent; if it still fails, return the answer with `status="flagged"` and the figures
listed so the UI can mark them — never silently emit unverified prose.

### The memory contract (W2 — the learning twin)

```python
class MemoryRecord(BaseModel):
    kind: str                              # "episodic" | "semantic" | "procedural"
    key: str
    content: dict
    provenance: str                        # tool/run id that produced it — memory is evidence too
    confidence: float | None = None
    created_at: datetime

class MemoryStore(ABC):
    """Postgres-backed. The twin's ability to learn across sessions."""
    @abstractmethod
    def record_episode(self, scenario_id: str, params: dict,
                       kpis: dict, outcome: dict) -> str: ...
    @abstractmethod
    def record_fact(self, key: str, content: dict, provenance: str) -> str: ...
    @abstractmethod
    def record_heuristic(self, name: str, rule: dict, provenance: str) -> str: ...
    @abstractmethod
    def recall(self, kind: str, query: dict, limit: int = 10) -> list[MemoryRecord]: ...
```

**Memory obeys the same rule as everything else:** an agent may *write* a heuristic, but
every numeric field it stores must carry `provenance` pointing at the tool run that
produced it. Memory is not a loophole for fabrication.

## 5. The registry & agent auto-discovery

```python
# backend/hubris/core/registry.py
class Registry:
    def register(self, kind: str, plugin) -> None: ...
    def get(self, kind: str, name: str): ...
    def all(self, kind: str) -> list: ...
    def as_agent_tools(self) -> list[AgentTool]:
        """Expose metrics, scenarios, and optimizers as agent tools so that
        registering a plugin automatically makes it available to every agent
        (including custom agents from the Agent Builder)."""
```

Plugins self-register at startup (decorator or entry-point scan). The agent layer builds its toolset from `registry.as_agent_tools()` — so **adding a plugin needs no change to any agent.** That is the property that makes the Agent Builder and parallel work possible.

## 6. How to add a new capability

### Add a metric
1. Create `backend/hubris/plugins/metrics/<name>.py` implementing `Metric`.
2. Register it. It now appears in KPIs and as an agent tool. Add a frontend card if user-facing.

### Add a scenario (what-if)
1. Create `backend/hubris/plugins/scenarios/<name>.py` implementing `ScenarioModule`.
2. Define `params_schema`. `apply()` returns a modified copy of the model.
3. Register it. Agents can now run it; add a UI control if user-facing.

### Add an optimiser strategy
1. Create `backend/hubris/plugins/optimizers/<name>.py` implementing `OptimizerStrategy`.
2. Register it. The goal-driven loop can now select it. Keep a greedy fallback path.

### Add an agent tool
1. Wrap an engine call in an `AgentTool`. `run()` returns computed JSON only.
2. Register it. Give it a precise `description` — the agent chooses tools by description.

### Add / customise an agent (Agent Builder)
An agent is: a name, a plain-English goal/system prompt, an allowed subset of registry tools, and an autonomy mode (on-demand | monitoring). Persist it; it works immediately because its tools already compute. Never give an agent a way to answer with numbers that didn't come from a tool.

`monitoring` autonomy means the agent is **actually scheduled and self-runs** (W4) — it
scans, runs a real simulation, and emits an alert card. Do not accept an autonomy mode
that is validated and then ignored.

### Add a memory
1. Decide the tier: **episodic** (what happened — a scenario run and its outcome), **semantic** (a fact learned about this network), or **procedural** (a decision pattern / heuristic to apply later).
2. Write through `MemoryStore`, never straight to SQLAlchemy — the contract is what keeps provenance mandatory.
3. Every numeric field needs a `provenance` string naming the tool run that produced it.
4. If an *agent* writes it, it must go through the `record_heuristic` tool, which stamps provenance automatically.

### Expose a tool over MCP
Registry tools are exposed over MCP (W6) by the adapter, not one-by-one. Implement `AgentTool`, register it, and it appears on the MCP surface automatically — the same property that makes it available to every agent. Do not hand-write per-tool MCP definitions.

## 7. Conventions

- **Language/stack:** Python 3.11+, FastAPI, SQLAlchemy, Pydantic v2; Next.js/React + deck.gl frontend; OR-Tools/PuLP, NetworkX, NumPy/Pandas engine.
- **No browser storage APIs** in the frontend (won't run in the artifact/preview context) — keep state in React.
- **Determinism:** engine functions are pure where possible; same input → same output. Set solver seeds/time limits.
- **Every optimiser needs a fallback** so the demo never hangs (min-cost flow always solves; MILP has greedy fallback).
- **Tests:** every engine function gets a tiny hand-checkable fixture (e.g. 2 hubs, 3 zones) proving the maths.
- **Synthetic-first:** build and test against `backend/hubris/data/` synthetic fixtures; the real dataset only changes the ingestion mapping.
- **Secrets:** the Claude API key is provided by the environment — never hard-code it.

## 8. Guardrails for you specifically (the AI contributor)

- Don't add heavyweight dependencies without a fallback (e.g. OSRM setup can fail — keep haversine).
- Don't drift toward full VRP / street-level routing — it's out of scope by design.
- Don't build demo-only flash with no operator value — the feature bar is "a planner would find this genuinely useful."
- When unsure whether a number is engine-derived or LLM-guessed, assume it must be engine-derived and wire the tool.
- Prefer extending via a plugin over editing the core. If you must touch the core, keep it thin.

## 9. Git workflow (mandatory)

- After completing each ticket: stage, commit, and push to origin.
- Author every commit as `simeon-devs <simw4380@gmail.com>`.
- NEVER add a Co-Authored-By trailer or any co-author. Single-author commits only.
- Never include "Generated with Claude Code" or similar in commit messages.
- One commit per completed ticket; message references the ticket ID (e.g. "T-02: core contracts").
