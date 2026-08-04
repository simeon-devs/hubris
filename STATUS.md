# STATUS — skeptical code audit

> Read-only audit performed 2026-08-04 against the actual code, not `TASKS.md` labels.
> Nothing was modified, built, or fixed. Every claim below was verified by reading the
> source or executing it.

---

## TL;DR

The engine is genuinely solid and the numbers are real. The **agentic guardrail — the
project's single most important claim — is not enforced at runtime and fails ~60% of the
time on at least one live path.** Three features marked DONE are unreachable by a user.
The DB layer is dead weight. Everything else broadly matches the docs.

**Verdict by count:** 15 SOLID · 6 PARTIAL · 3 EFFECTIVELY-STUB (working code, not wired
to anything a user can reach).

---

## 1. The headline finding: the no-fabrication guardrail is not enforced

This is the one thing that would lose the track, so it goes first.

**The claim** (`CLAUDE.md §2`, `README.md`, `BUILD_SPEC §13`): *"Agents orchestrate and
explain. The deterministic engine computes. No agent ever invents a number."* BUILD_SPEC
§13 specifically says to *"enforce the guardrail in code."*

**What is actually in the code:**

| Layer | Status |
|---|---|
| Tools return computed JSON only | ✅ Real (`hubris/agents/tools/*.py`) |
| Tool-call trace surfaced to the UI | ✅ Real (`AgentQueryResponse.tool_calls`, `AgentChat.tsx`) |
| System prompt forbidding arithmetic | ✅ Present (`runner.py:26`) |
| **Runtime check that the answer contains no ungrounded number** | ❌ **Does not exist** |

`hubris/agents/provenance.py` implements exactly the right checker
(`find_unexplained_numbers`). **No runtime module imports it.** Verified:

```
grep -rn "from hubris.agents.provenance" hubris/    ->  no matches
```

Its only callers are in `tests/`. `runner.py`'s own docstring (line 8) claims *"it is not
the ONLY enforcement — provenance.py checks the actual answer against actual tool results
after the fact"* — **that statement is false in the shipped code.** `run_agent_query`
never calls it, and `/agent/query` returns the answer unchecked.

**And the prompt alone demonstrably does not hold.** Running the live agent tests with a
real API key, `test_seeded_cost_advisor_answers_a_real_question_using_only_tool_numbers`
failed **3 out of 5 consecutive runs**. Captured fabrication:

> "**Total cost reduction: ~29,088 AED** annually"

That figure appears in no tool result — the agent multiplied 6.79 AED/parcel × 4,283
parcels itself, exactly what prompt rule 2 forbids, and then mislabelled a single-period
figure as "annually." A second test (`test_whatif_question_is_fully_grounded`) failed on
the same run with unexplained values `[244.5, 215.5]`.

**Consequences:**
1. In a live demo, a fabricated number renders in the UI with no warning and no flag.
2. The `tool_calls` trace shown under each message proves *which tools ran* — it does
   **not** prove the prose contains only their numbers. A judge who checks the arithmetic
   against the badge will find the discrepancy before we do.
3. The full test suite **passes 138/138 with the agent tests skipped** (all 9 skips are
   `requires a live ANTHROPIC_API_KEY`). The green suite gives no signal about the
   differentiator.

**Honest framing:** the *architecture* is right — agents genuinely cannot read raw data,
only tool outputs. What is missing is the last mile: nothing verifies the prose. The
checker is written and tested; it is simply not wired in.

---

## 2. Component audit

Classification: **SOLID** = real and working · **PARTIAL** = works but thin or incomplete
· **STUB** = code exists but no user-reachable path.

### Engine — the strongest part of the codebase

| Component | Status | Evidence |
|---|---|---|
| Cost/KPI calculator | **SOLID** | `plugins/metrics/{cost_to_serve,utilization,coverage,spare_capacity}.py`; hand-checked fixtures in `tests/test_metrics.py` |
| Min-cost flow + duals | **SOLID** | `engine/flow.py` — proper capacitated transportation LP via HiGHS; duals returned; overflow-slack keeps it always-solvable. `tests/test_flow.py` verifies the dual equals the real objective delta by re-solving, not by assertion |
| MILP recommender | **SOLID** | `plugins/optimizers/milp.py` — real binary `y_j` CFLP in PuLP/CBC with time limit |
| Greedy fallback | **SOLID** | `plugins/optimizers/greedy.py`, wired via `try/except` in `milp.py:33`; `test_milp_falls_back_to_greedy_when_it_cannot_solve` forces the path |
| Scenario modules (6) | **SOLID** | `plugins/scenarios/*.py`; all copy-on-write, all tested for non-mutation |
| Monte Carlo bands | **SOLID** | `engine/monte_carlo.py` — pure NumPy, seeded, re-solves the LP per trial |
| Road distances (OSRM) | **SOLID** | `engine/routing.py`; whole-batch fallback; live-tested against the public OSRM server |
| Registry / plugin contracts | **SOLID** | `core/registry.py` with `pkgutil` auto-discovery — adding a plugin genuinely requires no agent change |
| **H3 zoning** | **STUB (unreachable)** | `engine/h3_zoning.py` is real and tested, but `ExcelDataConnector.load(aggregate_zones_to_h3=False)` defaults off and **`/ingest` never passes it** (`routers/ingest.py:22`). No user can turn it on. T-19 is half-live |
| Ingestion + schema mapper | **SOLID** | `ingestion/schema_mapper.py` — fuzzy + optional LLM column mapping, `NeedsConfirmationError` on ambiguity; genuinely schema-agnostic |
| **Postgres / ORM layer** | **STUB (dead at runtime)** | `core/{orm,db,db_loader}.py` = 164 lines. **Nothing outside those files imports them.** All state is the in-memory `AppState`. Migrations run at boot but nothing reads or writes the DB. Only consumer is `tests/test_db.py`. T-05 is DONE as *schema*, not as a live layer |

### Agent layer

| Component | Status | Evidence |
|---|---|---|
| Agent tools (10) | **SOLID** | `agents/tools/*.py`, all registered and auto-discovered |
| Multi-agent workforce | **PARTIAL** | `agents/workforce.py` — real LangGraph router → 5 role specialists with restricted toolsets. Works. But the "workforce" is a **router + one specialist per query**; agents never collaborate, hand off, or debate. Reads as multi-agent, behaves as routed-single-agent |
| Agent Builder | **PARTIAL** | `agents/builder.py` + full CRUD API + UI. Real and works. But `autonomy="monitoring"` is **validated against a set and then ignored** — nothing schedules or triggers a monitoring agent. `capacity_watchdog` is seeded as `monitoring` and never runs on its own. The field is cosmetic |
| **Goal-driven loop** | **STUB (orphaned)** | `agents/goal_loop.py` is a real implementation with real tests — and **is called from nowhere**. Not an agent tool, no API route, no UI. Verified: only `tests/test_goal_loop.py` imports it. BUILD_SPEC §5.3 lists it as a headline capability; a user cannot reach it |
| Provenance checker | **STUB (test-only)** | See §1 |

### API + Frontend

| Component | Status | Evidence |
|---|---|---|
| FastAPI routers (12) | **SOLID** | All 11 GET/POST endpoints verified returning 200 live |
| Map (deck.gl) | **SOLID** | `NetworkMap.tsx` — real Heatmap + Arc + Scatterplot layers over MapLibre raster basemap |
| KPI cards | **SOLID** | `KpiCards.tsx` reads `metric.value` straight from the API; no client-side arithmetic |
| Scenario panel | **PARTIAL** | `ScenarioPanel.tsx` exposes **3 of 6** registered scenarios (`close_hub`, `demand_scale`, `change_fleet_mix`). `move_hub`, `add_hub`, `add_customer` are API/agent-only — invisible in the UI |
| Before/after diff | **SOLID** | `ScenarioDiff.tsx`, incl. the negligible-delta guard |
| Agent chat | **SOLID** (as UI) | `AgentChat.tsx` with expandable per-tool JSON badges — genuinely good provenance *surfacing*, though see §1 for what it does not prove |
| Scenario picker + seeded demo | **SOLID** | `data/demo_scenario.py`, seeded at lifespan, feasibility-checked, degrades to `None` rather than raising |

### Phase 5 signature features

| Component | Status | Evidence |
|---|---|---|
| Opportunity scanner | **SOLID** | `engine/opportunities.py` — 3 real finders, `why` strings built by Python formatting (not LLM). Live: 9 findings / 3 types on the demo scenario |
| Threshold finder | **SOLID** | `agents/threshold_finder.py` — genuine exponential-then-binary search, each trial a real LP re-solve |
| Bottleneck unlock | **SOLID** | `engine/bottleneck.py` — duals *rank* candidates, a real re-solve *verifies* savings. Correctly refuses to extrapolate a dual |
| Decision brief | **PARTIAL** | `agents/decision_brief.py` is pure orchestration of three existing tools + a formatted summary. Correct and honest, but it is **assembly, not new computation** — thinner than "auto decision-brief" implies. Export is a client-side Markdown Blob |

---

## 3. Does it run?

**Yes.** `docker compose ps` → all three containers up 2 days. Migrations run automatically
at backend startup. Frontend serves 200.

| Flow | Result |
|---|---|
| `GET /kpis` | ✅ 200 |
| `POST /simulate` (close_hub H1) | ✅ 200 |
| `POST /optimize` | ✅ 200 |
| `GET /opportunities` · `/bottleneck` · `/brief` · `/threshold/*` | ✅ 200 |
| Ingest → KPIs | ✅ covered by `test_ingest_replaces_the_baseline` (passing) |
| Agent query → tool-grounded answer | ⚠️ **Works, but unreliably** — see §1 |

A live `/agent/query` during this audit returned a correctly-grounded answer routed to the
`optimizer` role calling `optimise_network`. The *same* class of query fabricated a number
3 of 5 times in the seeded-agent test. **The demo path works most of the time.**

**Untested end-to-end:** ingest of a *real-shaped* multi-sheet workbook through the UI
upload control; H3 aggregation (unreachable); goal loop (unreachable); DB persistence
(nothing writes to it).

---

## 4. Tests

| Run | Result |
|---|---|
| Default (no API key) | **138 passed, 9 skipped** |
| With live `ANTHROPIC_API_KEY` | **145 passed, 2 failed** |
| `test_agent_builder.py::...cost_advisor...` ×5 | **2 passed / 3 failed** |

**All 9 default skips are the LLM tests.** So the standard green run exercises zero agent
behaviour — the entire differentiator and the guardrail's only live-fire check are absent
from the number that gets quoted.

**Well covered:** engine maths (hand-checkable fixtures throughout — the dual-vs-objective
re-solve test in `test_flow.py` is genuinely rigorous), scenario copy-on-write,
optimiser fallback, ingestion/fuzzy-mapping, routing fallback, Monte Carlo determinism,
opportunity/threshold/bottleneck/brief logic, API status codes.

**Not covered:** any frontend test whatsoever (no Jest/Vitest/Playwright in the repo —
UI correctness rests on manual screenshot checks); DB persistence beyond one round-trip;
agent behaviour deterministically (it *cannot* be, but there is no retry/quarantine
either); H3 and goal-loop integration paths (unit-tested, never integration-tested,
because no integration exists).

---

## 5. Guardrail — enforced in code?

**No.** Detailed in §1. Summary: architectural containment is real (agents can only
obtain numbers via tools); *verification* is absent (nothing checks the prose); the
checker exists but is test-only; and the prompt-only guarantee empirically fails ~60% of
the time on one seeded agent.

---

## 6. Brief vs beyond

**Commodity — any competent team builds this:**

- KPI dashboard + map. Table stakes.
- Close/open-hub what-if with before/after. Expected.
- A chatbot over the data. Everyone will have one.
- Excel upload. Expected.
- Docker Compose. Expected.

**Satisfies the brief, done unusually well:**

- **Min-cost flow with duals extracted** — most teams will use a heuristic assignment.
  Keeping the LP formulation *specifically* so shadow prices come free is a deliberate
  and correct OR decision.
- **MILP + greedy fallback wired from the start**, not bolted on. The demo cannot hang.
- **Schema-agnostic ingestion** with confidence thresholds and explicit
  `NeedsConfirmationError` rather than silent mis-mapping.
- **Plugin registry with agent auto-discovery** — registering a plugin exposes it to every
  agent with no agent edit. Genuinely good architecture; invisible to judges unless shown.

**Genuinely differentiated:**

- **Bottleneck unlock (T-23).** Turning LP duals into "add N units at hub X, save Y —
  verified by re-solving, not extrapolated from the dual." Most teams will not extract
  duals at all; of those that do, most would multiply the dual by N and call it a saving.
  Refusing that shortcut is the single most technically impressive decision in the repo.
- **Monte Carlo robustness band attached to every recommendation.** Shipping "holds under
  ±20% demand, feasible in 100% of 50 trials" alongside a point estimate is rare.
- **Opportunity scanner with deterministic `why` strings.** Proactive rather than
  responsive, and the explanations are Python-formatted from computed figures — trustworthy
  even with the LLM switched off.
- **Real road distances with an honest mode badge.** The +14.2% cost shift when OSRM
  replaces haversine, displayed with a REAL/FALLBACK badge, is a credibility moment.
- **Threshold finder** — binary search over real LP re-solves to find the actual tipping
  point, rather than reporting a gradient.

**Marketed as differentiated, but currently is not:**

- **"Multi-agent workforce"** → a router plus one specialist. No inter-agent collaboration.
- **"Goal-driven optimisation loop"** → real code, unreachable by any user.
- **"Agent Builder with autonomy modes"** → CRUD works; `monitoring` does nothing.
- **"Auto decision-brief"** → assembly of three existing tool outputs, not new analysis.

---

## 7. Honest gaps and demo risks

**Ranked by how much damage they do if a judge finds them first.**

1. **The agent fabricates numbers ~60% of the time on at least one path, and nothing
   catches it.** Highest severity. Mitigations, cheapest first: (a) call
   `find_unexplained_numbers` in `run_agent_query` and either strip/flag the answer or
   surface an "unverified figure" warning; (b) return the verdict in
   `AgentQueryResponse` so the UI can badge it; (c) if neither, pre-script the demo
   questions and rehearse them, because the failure is question-dependent.
2. **`runner.py:8` states the provenance check runs after the fact. It does not.** A
   docstring asserting a safety property the code does not implement is worse than
   silence — fix the comment even if the check is not wired.
3. **Utilization can read >100%** (`H5 = 107.67%` on the seeded demo scenario). Artifact of
   `assigned_volume_by_hub` using dominant-hub-per-zone while the flow splits the zone.
   Flow says exactly 100%. Previously raised; still open; still on the default demo path.
4. **Goal loop is unreachable.** If the pitch mentions it, that is a claim about code no
   user can run. Either wire it (an agent tool would be ~30 lines) or cut it from the
   narrative.
5. **All 9 skipped tests are the agent tests.** "138 passing" is not evidence about the
   differentiator. Quote the number with that caveat, or not at all.
6. **The DB is decorative.** 164 lines of ORM/loader plus a migration that runs at every
   boot, feeding nothing. Harmless, but "PostgreSQL" on an architecture slide overstates it.
7. **No frontend tests at all.** A UI regression ships silently.
8. **H3 unreachable from the API** — cannot be demoed even though it is built and tested.
9. **Half the scenario modules are invisible in the UI** (3 of 6).
10. **Live-demo dependency on the public OSRM server.** Fallback is proven clean, but the
    badge flipping to amber mid-pitch invites a question. Self-hosting was recommended
    earlier and not done.
11. **`create_react_agent` is deprecated** (LangGraph V1, removal in V2) — emits a warning
    on every agent run; visible if a terminal is on screen.

---

## What is genuinely good, stated plainly

The OR core is the real thing: a correct capacitated transportation LP, duals used
properly, a MILP with a working fallback, and hand-checkable tests that verify maths by
re-solving rather than by asserting remembered constants. The plugin architecture delivers
what it promises. The bottleneck unlock, robustness bands, opportunity scanner and road-
distance honesty badge are all above the waterline of what this track will typically see.
Numbers reported in `TASKS.md` matched executed output everywhere I checked.

The gap is not the engine. It is that the *agentic* layer — the part the track scores
hardest on — is thinner and less safe than the documentation states.

---

*Audit method: read `CLAUDE.md`, `BUILD_SPEC.md`, `TASKS.md` for intent; walked all 7,160
lines of backend + frontend source; grepped for stubs and for unreachable code paths; ran
the test suite with and without a live API key; executed every API endpoint against the
running stack; ran the fabrication-sensitive test 5× to measure flake rate. No files were
modified.*
