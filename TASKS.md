# TASKS — Hubris build board

> The delegation + tracking board. Every ticket is scoped to a contract in `CLAUDE.md`, so it can be built and reviewed independently.
> **Status lives in the Index table below — that's the single source of truth for follow-up.** Ticket details hold the contract, the "done when", and a short log.

---

## How to use this board (read first — applies to humans AND AI)

**Status legend:**

| Tag | Meaning |
|-----|---------|
| `TODO` | Not started. |
| `WIP` | In progress. Whoever picks it up writes their name + date. |
| `REVIEW` | Work finished by the builder — **waiting for the leader (Sims) to test & sign off.** |
| `DONE` | Leader tested it and accepts it. **Only Sims sets this.** |
| `BLOCKED` | Can't proceed — reason required in the log. |

**Update protocol (Claude Code and any AI must follow this):**
1. When you start a ticket → set its Index status to `WIP`, add a log line: `WIP — <who> — <date>`.
2. When you finish → set status to `REVIEW` (never `DONE`), add a log line summarising what you did and how to test it. Do **not** self-mark `DONE`.
3. If stuck → set `BLOCKED`, add a log line with the reason and what you need.
4. A ticket is only `DONE` once **Sims** has tested it against its "Done when" and moved it there.
5. Update the Index row **and** append to the ticket's log. The Index is what gets scanned for follow-up.

**Definition of done for every ticket** (in addition to its specific "Done when"): implements its stated contract from `CLAUDE.md`, registers with the plugin registry where applicable, has a tiny hand-checkable test, and never lets an agent emit a number that didn't come from a tool.

**Owners:** A = engine/data · B = agents · C = frontend · D = accuracy/polish · L = Sims (leader/review). Reassign freely.

---

## Index (status at a glance)

| ID | Ticket | Phase | Owner | Status |
|----|--------|-------|:-----:|:------:|
| T-01 | Repo scaffold + Docker Compose | 0 Scaffold | A | DONE |
| T-02 | Core: NetworkModel + contracts.py | 0 Scaffold | A | DONE |
| T-03 | Core: plugin registry + agent auto-discovery | 0 Scaffold | A | DONE |
| T-04 | Synthetic EMX dataset fixtures | 0 Scaffold | A | DONE |
| T-05 | Canonical schema + Postgres migrations | 0 Scaffold | A | DONE |
| T-06 | Ingestion + schema mapper (DataConnector) | 1 Engine | A | DONE |
| T-07 | Cost/KPI calculator (Metric plugins) | 1 Engine | A | DONE |
| T-08 | Min-cost flow assignment + duals | 1 Engine | A | DONE |
| T-09 | MILP recommender + greedy fallback | 1 Engine | A | DONE |
| T-10 | Scenario modules (move/close/add hub, fleet, demand) | 1 Engine | A | DONE |
| T-11 | LangGraph agent tools wrapping the engine | 2 Agents | B | REVIEW |
| T-12 | Multi-agent workforce graph | 2 Agents | B | REVIEW |
| T-13 | Goal-driven optimisation loop | 2 Agents | B | REVIEW |
| T-14 | Agent Builder (custom agents + templates) | 2 Agents | B | REVIEW |
| T-15 | FastAPI routers | 3 API/UI | B/C | TODO |
| T-16 | Frontend shell + map (deck.gl) | 3 API/UI | C | TODO |
| T-17 | KPI cards + scenario panel + before/after diff | 3 API/UI | C | TODO |
| T-18 | Agent chat + Agent Builder panels | 3 API/UI | C | TODO |
| T-19 | Real road distances + H3 zoning | 4 Accuracy | D | TODO |
| T-20 | Monte Carlo confidence bands | 4 Accuracy | D | TODO |
| T-21 | Opportunity scanner | 5 Signature | B | TODO |
| T-22 | Threshold / break-even finder | 5 Signature | B | TODO |
| T-23 | Prescriptive bottleneck unlock (duals → action) | 5 Signature | B | TODO |
| T-24 | Auto decision-brief | 5 Signature | B/C | TODO |
| T-25 | Demand forecast (Prophet) | 6 Stretch | D | TODO |
| T-26 | Institutional memory (Qdrant) | 6 Stretch | B | TODO |
| T-27 | SimPy waves | 6 Stretch | A | TODO |
| T-28 | Real dataset ingestion + calibration (EVENT DAY) | 7 Event | A | TODO |
| T-29 | Baseline validation + sensitivity + sanity checks | 7 Event | A/D | TODO |
| T-30 | Demo seed scenario + pitch + Q&A rehearsal | 7 Event | L | TODO |

**Build order:** finish Phase 0 → 1 before anything else (it's the critical path). Phases 2 and 3 can run in parallel once 0–1 exist. Phase 4 as soon as the engine is stable. Phase 5 is the differentiator — do it before stretch. Phase 6 only if core is solid. Phase 7 is the event day itself.

---

## Tickets

### Phase 0 — Scaffold

**T-01 · Repo scaffold + Docker Compose**
Contract: n/a (infra). Depends on: none.
Done when: `docker compose up` brings up Postgres + FastAPI (health route) + Next.js (blank page); repo layout matches `ARCHITECTURE.md §7`.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — Repo layout matches `ARCHITECTURE.md §7` (backend/hubris/{core,ingestion,engine,plugins/*,agents,api,data}, backend/tests, frontend/, docker-compose.yml). Backend: FastAPI app with `GET /health`. Frontend: Next.js (App Router, TS) with a literal blank page (`return null`). To test: `docker compose up -d --build` from repo root, then `curl http://localhost:8000/health` → `{"status":"ok"}`, and `curl -o /dev/null -w "%{http_code}" http://localhost:3000/` → `200`. Verified live in this session (all 3 containers up, db healthy, both endpoints returned expected results), then torn down with `docker compose down`.
- DONE — Sims — 2026-07-31

**T-02 · Core: NetworkModel + contracts.py**
Contract: defines all of them (`DataConnector`, `Metric`, `ScenarioModule`, `OptimizerStrategy`, `AgentTool`) + `NetworkModel`, `MetricResult`, `Recommendation`. Depends on: T-01.
Done when: the abstract interfaces from `CLAUDE.md §4` exist and import cleanly; `NetworkModel` hydrates from fixtures.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/core/models.py`: `Hub`, `Zone`, `FleetType`, `OD`, `RawTables` per `SCHEMA.md §1`. `backend/hubris/core/contracts.py`: the 5 ABCs + `NetworkModel`/`MetricResult`/`Recommendation` verbatim from `CLAUDE.md §4`, plus `NetworkModel.from_raw_tables()` to hydrate. Per the confirmed decision, `assignments` stays single dominant-hub-per-zone (`dict[str,str]`) even though `current_assignments` rows can split a zone across hubs — the dominant hub (largest volume) wins; full split volumes are preserved in the raw/DB layer, not in this field. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_contracts.py -v"` → 3 passed (contracts import cleanly; tiny 2-hub/3-zone fixture hydrates correctly, including dominant-hub resolution for a deliberately-split zone; MetricResult/Recommendation shapes valid).
- DONE — Sims — 2026-07-31

**T-03 · Core: plugin registry + agent auto-discovery**
Contract: `Registry` (`CLAUDE.md §5`). Depends on: T-02.
Done when: plugins self-register at startup; `registry.as_agent_tools()` returns tools for all registered metrics/scenarios/optimisers; adding a plugin needs no agent change (prove with one dummy plugin).
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/core/registry.py`: `Registry` (`register/get/all/as_agent_tools`) + decorators (`register_metric/scenario/optimizer/agent_tool/data_connector`) for self-registration, and `load_plugins()` which walks `hubris.plugins.{metrics,scenarios,optimizers}` via `pkgutil` so dropping a new plugin file in is enough — no registry/agent code changes needed. `as_agent_tools()` wraps every registered `Metric`/`ScenarioModule`/`OptimizerStrategy` in a thin `AgentTool` adapter whose `run()` calls the real `compute`/`apply`/`optimize` and returns `.model_dump()` — computed JSON only. Proved the keystone property in `tests/test_registry.py`: a dummy `Metric` plugin registered only via `@register_metric` shows up in `registry.all("metric")` and as `as_agent_tools()`'s `"metric_dummy_spare_capacity"` tool, and calling it returns a number derived from `NetworkModel` data, not asserted independently. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/ -v"` → 6 passed.
- DONE — Sims — 2026-07-31

**T-04 · Synthetic EMX dataset fixtures**
Contract: fills every canonical table (`SCHEMA.md §3`). Depends on: T-02.
Done when: ~7–10 hubs, ~50–150 zones, 3–4 fleet types, demand, and a plausible current assignment load into `NetworkModel`.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/data/synthetic.py`: `generate_synthetic_raw_tables(seed=42)` deterministically builds 9 hubs (2 each in Dubai/Abu Dhabi, 1 in each of the other 5 emirates), 100 zones spread across all 7 emirates (weighted toward Dubai/Abu Dhabi), 4 fleet types (Bike/Van/Small Truck/Truck, network-wide not hub-pinned), a full hub×zone `od_matrix` (haversine × 1.3 road-factor fallback per `SCHEMA.md §2`, cost = distance × Van's cost_per_km + hub handling_cost), and a nearest-open-hub-with-capacity baseline `current_assignments` that splits a zone across hubs when the nearest one doesn't have room. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/ -v"` → 12 passed, incl. `test_synthetic_data.py`: counts in spec, hydrates into `NetworkModel`, deterministic per seed, every zone's demand fully assigned, no hub capacity exceeded, od_matrix covers every hub×zone pair.
- DONE — Sims — 2026-07-31

**T-05 · Canonical schema + Postgres migrations**
Contract: `SCHEMA.md §1`. Depends on: T-01.
Done when: all canonical tables migrate cleanly; ORM models match; synthetic data persists and reloads.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/core/orm.py`: SQLAlchemy 2.0 ORM models for all 7 canonical tables from `SCHEMA.md §1` (`hubs, zones, fleet_types, od_matrix, current_assignments, scenarios, scenario_results`; skipped the optional stretch-only `demand_history`/`service_models`), matching column names/types/PKs/FKs exactly (incl. `status` server-side default, `created_at` server-side `now()`, JSONB for `params`/`kpis`/`flows`/`duals`). `backend/hubris/core/db.py`: engine/session, `DATABASE_URL` from env only. `backend/migrations/`: Alembic scaffold wired to `Base.metadata` and `DATABASE_URL`; one autogenerated revision (`61f30020dab4_canonical_schema.py`) creates all 7 tables. `backend/hubris/core/db_loader.py`: `load_raw_tables`/`read_raw_tables` round-trip `RawTables` through Postgres (hubs/zones flushed first since the unit-of-work has no `relationship()` to infer FK insert order on its own). To test: `docker compose up -d db` (wait healthy), `docker compose run --rm backend alembic upgrade head` (applies cleanly, verified via `psql \dt` — all 7 tables present), then `docker compose run --rm backend python -m pytest tests/ -v` → 13 passed, incl. `test_db.py::test_synthetic_data_persists_and_reloads` (generates the T-04 synthetic dataset, loads it into Postgres, reads it back, and asserts an exact match per table). Also re-verified `docker compose up -d --build` still brings up all 3 services and `/health` responds after the Dockerfile change (now also copies `migrations/` + `alembic.ini`).
- DONE — Sims — 2026-07-31

### Phase 1 — Engine (critical path)

**T-06 · Ingestion + schema mapper (DataConnector)**
Contract: `DataConnector`. Depends on: T-04, T-05.
Done when: an Excel → canonical mapping runs with fuzzy + LLM-assisted column matching + low-confidence confirm; downstream reads only canonical tables (`SCHEMA.md §2`).
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/ingestion/excel_connector.py`: `ExcelDataConnector` (`DataConnector`, registered as `"excel"`). Sheet→table matching is by sheet NAME against synonyms (`hubris/ingestion/schema_mapper.py`'s `TABLE_SHEET_SYNONYMS`) — much more reliable than column overlap alone, since hubs/zones both have id/name/lat/lon/emirate-shaped columns. Column→field mapping is schema-agnostic fuzzy matching (rapidfuzz, `max(WRatio, token_set_ratio)`); fields still ambiguous after that get one LLM-assisted proposal attempt (Claude Haiku via `ANTHROPIC_API_KEY`, propose-only, never transforms data — silently no-ops with no key/on any failure, proven by a test with no key set); anything still unresolved raises `NeedsConfirmationError` naming the field and best guess, resolvable via a `column_overrides` param (stands in for the human-confirm UI, which is T-18). Missing `od_matrix`/`current_assignments` sheets are derived, not fatal: `hubris/engine/geo.py` (haversine × 1.3 road-factor) + the cost formula for OD, `hubris/engine/baseline.py`'s nearest-hub-with-capacity for the assignment baseline — both factored out of T-04's `synthetic.py` for reuse (refactored, re-verified against the existing synthetic-data tests). To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_excel_connector.py -v"` → 5 passed: extension-based `can_handle`, messy-column mapping + derivation of both missing tables (with geographic sanity checks and an exact demand-conservation check), graceful LLM no-op with no API key, and the `NeedsConfirmationError` → `column_overrides` resolution round-trip. Full suite (`pytest tests/ -v`, with `db` up + `alembic upgrade head` for `test_db.py`) → 18 passed, no regressions from the geo/baseline refactor.
- DONE — Sims — 2026-08-01

**T-07 · Cost/KPI calculator (Metric plugins)**
Contract: `Metric`. Depends on: T-02, T-04.
Done when: cost-to-serve, utilisation, coverage, spare-capacity metrics compute for any config; each has a hand-checkable fixture; each registered and exposed as an agent tool.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — 4 `Metric` plugins in `backend/hubris/plugins/metrics/`, each self-registered via `@register_metric`: `cost_to_serve` (`(Σ transport + Σ fixed-for-open-hubs) / Σ demand`, BUILD_SPEC §3), `utilization` (per-hub + capacity-weighted network average), `coverage` (% demand served within its zone's SLA), `spare_capacity` (capacity − assigned, per hub + network total). All read `NetworkModel.assignments` (dominant-hub-per-zone) + `od_matrix`/`demand` only — vectorised-in-spirit, instant, never fails, no solver involved (layer 1 of the 3-layer engine, BUILD_SPEC §4). Shared `hubris/engine/assignment.py::assigned_volume_by_hub()` factors out the per-hub aggregation used by 2 of the 4. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_metrics.py -v"` → 5 passed, all hand-computed against the tiny 2-hub/3-zone fixture (cost_to_serve=2600/60=43.3333 AED/parcel, utilization: network 30%/H1 50%/H2 10%, spare_capacity: H1 50/H2 90, coverage 100%), plus one test proving all 4 are picked up by `load_plugins()` and callable through `registry.as_agent_tools()`. Full suite → 22 passed. Sanity-checked against the full T-04 synthetic dataset too (not asserted, just eyeballed): baseline cost-to-serve ≈ **57.09 AED/parcel**, network utilization ≈ 15.9%, coverage 100%, spare capacity ≈ 22,667 parcels — numbers to sanity-check once T-08/T-09 land, since utilization this low signals plenty of room for the optimiser to consolidate.
- DONE — Sims — 2026-08-01

**T-08 · Min-cost flow assignment + duals**
Contract: engine (`assign(model) -> Assignment(+duals)`). Depends on: T-04.
Done when: optimal zone→hub for baseline/scenarios; always solves; returns shadow prices for T-23. Tiny 2-hub/3-zone test passes.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/engine/flow.py::solve_min_cost_flow(model) -> FlowResult`. Formulated as a capacitated transportation LP (demand = equality per zone, capacity = inequality per open hub, SLA-infeasible edges excluded per BUILD_SPEC §3's `x_ij=0 if t_ij>T_max`) and solved with `scipy.optimize.linprog(method="highs")`, which returns `eqlin.marginals`/`ineqlin.marginals` as `zone_duals`/`hub_duals` **for free — no extra work needed for T-23**. Always-solves guardrail: a heavily-penalised per-zone overflow slack variable keeps the LP feasible even when total open-hub capacity < total demand, so it returns a `FlowResult` with `feasible=False` and `unmet_demand` populated instead of raising. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_flow.py -v"` → 5 passed: (1) unconstrained tiny fixture picks each zone's cheapest hub, total_cost=700, both hub duals ~0; (2) dropping H1's capacity to 40 forces 10 units of Z1 (not Z2 — 200/unit beats 206/unit) onto H2, total_cost=2700, H1 dual nonzero/H2 dual~0; (3) **re-solving at capacity=41 empirically confirms the H1 dual (200) exactly equals the real cost delta (2700-2500=200)** — LP sensitivity verified against the actual solver output rather than a hand-remembered sign convention (caught a real arithmetic mistake in my own first hand-calc, which is exactly why I checked it this way); (4) under-capacity input still returns a feasible=False result with correct unmet_demand, doesn't raise; (5) an artificially tight SLA correctly excludes a zone's only routes. Full suite → 27 passed. Sanity vs the full synthetic dataset: solves in ~6ms, optimal transport cost 132,567 vs the nearest-hub baseline's 132,577 (~0.01% — expected, since T-04's baseline generator is already near-optimal for a pure flow problem; the real ~5% target improvement is the MILP's hub open/close decision in T-09).
- DONE — Sims — 2026-08-01
- FOLLOW-UP — Claude — 2026-08-01 — Added the overflow-slack penalty-margin test requested during Phase 2 review: `test_overflow_penalty_prefers_an_expensive_real_route_over_reporting_unmet` proves a real route costing 500,000/unit (half the 1,000,000 overflow penalty, and enormous by this domain's standards) still gets used rather than reported as unmet; `test_overflow_penalty_still_flags_genuine_infeasibility_not_silently_absorbed` proves that when capacity genuinely can't cover demand, the shortfall surfaces as `unmet_demand`/`feasible=False`, not silently dropped. To test: `python -m pytest tests/test_flow.py -v` → 7 passed (5 prior + 2 new).

**T-09 · MILP recommender + greedy fallback**
Contract: `OptimizerStrategy`. Depends on: T-08.
Done when: binary hub open/close/move + fleet mix minimises cost; returns `Recommendation` with delta-vs-baseline; greedy fallback triggers if MILP slow/infeasible.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — Two `OptimizerStrategy` plugins in `backend/hubris/plugins/optimizers/`, both self-registered: `milp_cflp` (`milp.py`, PuLP+CBC, binary hub open/close `y_j` jointly with continuous flow `x_ij`, strict `time_limit_seconds` — default 20s) and `greedy` (`greedy.py`, best-improvement hill-climb over hub open/close using T-08's flow solver to score each candidate — bounded to O(hubs²) re-solves, each a few ms). **The greedy fallback is wired into `MILPOptimizer.optimize()` itself from the start**: any exception or non-"Optimal" CBC status is caught and delegates straight to `GreedyOptimizer`, labelling `rationale.solver="greedy"` + `fallback_reason` — never bolted on after the fact. Both read one constraint type so far (`{"type":"max_utilization","value":...}`, via the new `hubris/engine/constraints.py`); richer objective/constraint parsing is T-13's job. Caught my own bug during testing: an earlier *first*-improvement greedy (take the first hub whose closure helps, don't compare alternatives) chose the wrong hub to close on a fixture where two closures both "improved" but by very different amounts — fixed to *best*-improvement (evaluate every candidate each round, take the cheapest). To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_optimizers.py -v"` → 5 passed: (1) tiny 2-hub/3-zone fixture — both optimisers agree "keep both open" is already optimal (2600 = 700 transport + 1900 fixed, matches T-08); (2) a purpose-built fixture where H2's fixed cost (5000) dwarfs its per-unit transport edge (this is the case the first-improvement bug got wrong) — both optimisers correctly close H2, total=650; (3) MILP's rationale correctly reports itself when it solves; (4) forcing `time_limit_seconds=0.0` reliably makes CBC return "Not Solved" (verified empirically, not assumed) and the fallback returns the same correct answer as greedy alone, never raising; (5) both plugins discovered by `load_plugins()` and callable through `registry.as_agent_tools()`. Full suite → 32 passed. **Sanity vs the full synthetic dataset — both optimizers agree exactly**: close H1/H3/H5/H7 (the 4 lowest-utilization hubs), cost-to-serve drops from 57.09 → ~50 AED/parcel, **an 11.89% improvement**, comfortably past BUILD_SPEC's ~5% target. MILP solves in ~30ms, greedy in ~100ms — both trivially fast at this scale.
- DONE — Sims — 2026-08-01

**T-10 · Scenario modules**
Contract: `ScenarioModule` (one plugin each: `move_hub`, `close_hub`, `add_hub`, `change_fleet_mix`, `add_customer`, `demand_scale`). Depends on: T-02, T-07.
Done when: each `apply()` returns a modified **copy**; each has a params schema; each registered; baseline + scenario coexist for diffing.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — 6 `ScenarioModule` plugins in `backend/hubris/plugins/scenarios/`, each self-registered: `move_hub`, `close_hub`, `add_hub`, `change_fleet_mix`, `add_customer`, `demand_scale` (optionally scoped to one emirate). Every `apply()` uses `model.model_copy(deep=True)` then mutates only the copy; `move_hub`/`add_hub`/`add_customer` recompute the affected OD entries (shared `hubris/engine/cost_model.py`, factored out for this + `hubris/engine/geo.py` from T-06, so a moved/added hub or a new zone is immediately usable by T-08/T-09 without a separate ingestion step). `close_hub` deliberately only flips status — reassigning the zones it carried is re-optimisation (T-08/T-09's job), not a structural scenario change, so it doesn't touch `assignments`. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_scenarios.py -v"` → 8 passed: one hand-checked test per scenario (e.g. `demand_scale` at factor 1.2 on the tiny fixture gives exactly 36/24/12 from 30/20/10; emirate-scoped scale at 2.0 leaves the non-matching zone untouched) plus a mutation-safety assertion in every single test (the original model's values are checked unchanged after `apply()` runs) — and one test confirming all 6 are picked up by `load_plugins()` and callable through `registry.as_agent_tools()`. Full suite → 41 passed (incl. `test_db.py` with `db` up + migrated). Demoed baseline/scenario coexistence end-to-end on the full synthetic dataset: `demand_scale(factor=1.3)` gives a scenario model with 5567.9 total demand while the baseline model still reports its original 4283 — same object graph, no cross-contamination, ready for a before/after diff.
- DONE — Sims — 2026-08-01

**This closes Phase 0 + Phase 1 (T-01–T-10).** Full engine chain works end-to-end on the synthetic dataset: ingestion (T-06) → cost/KPI metrics (T-07) → optimal flow with duals (T-08) → MILP recommender w/ greedy fallback (T-09) → what-if scenarios (T-10). See the phase summary message for the headline numbers.

### Phase 2 — Agents

**T-11 · LangGraph agent tools wrapping the engine**
Contract: `AgentTool`. Depends on: T-07, T-08, T-09.
Done when: tools (`get_kpis`, `find_spare_capacity`, `simulate_scenario`, `optimise_network`, `compare_scenarios`) return computed JSON only; wired from the registry.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — 5 named `AgentTool`s in `backend/hubris/agents/tools/`, self-registered (registry auto-discovery extended to scan `hubris.agents.tools` too). `hubris/agents/tool_adapter.py` binds each to a specific `NetworkModel` via closure and converts its `input_schema` into a LangChain `StructuredTool` (dynamic pydantic model) — the LLM only ever supplies the tool's own business params, never the network state itself. `hubris/agents/runner.py`: a single LangGraph `create_react_agent` (Claude Haiku) is the one building block T-12/13/14 all reuse — its system prompt is the first enforcement layer for "no agent ever invents a number," but a prompt is a request, not a guarantee, so `hubris/agents/provenance.py` checks the ACTUAL answer against ACTUAL tool results after the fact. Caught 3 real issues by actually running this live against Claude (with a session-scoped key): (1) `simulate_scenario`/`compare_scenarios` computed KPIs off the stale baseline `assignments` after a hub closed — demand looked like it was still being served by a closed hub; fixed by re-solving flow after every scenario apply (`hubris/agents/scenario_utils.py`). (2) the model guessed wrong param field names for `demand_scale` (`scale_factor` vs the real `factor`) because the tool description didn't say what fields each scenario needs — fixed by generating the description from each registered scenario's real `params_schema`. (3) the model computed a savings percentage itself from two tool-returned numbers (arithmetic on grounded inputs is still forbidden per this task's explicit instruction) — fixed by having `simulate_scenario`/`compare_scenarios` return `delta_pct` directly so there's never a reason to compute one. To test (non-live, always runs): `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_agent_tools.py tests/test_provenance.py -v"` → 14 passed (5 tools hand-checked against the tiny fixture incl. the reoptimization regression test; provenance canary tests prove the checker both accepts rounded/sign-framed/user-restated numbers and REJECTS a planted fabricated one). Live guardrail test (skipped without `ANTHROPIC_API_KEY`): `python -m pytest tests/test_agent_no_fabrication.py -v` → 3 passed against the real Claude API — see the phase-end message for a full worked transcript.

**T-12 · Multi-agent workforce graph**
Contract: LangGraph graph. Depends on: T-11.
Done when: Network Analyst / Scenario Strategist / Optimizer / Cost Analyst / Risk agents collaborate to answer a question, every number traceable to a tool call.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/workforce.py`: a genuine LangGraph `StateGraph` — a `route` node classifies the question into one of 5 roles (Network Analyst, Scenario Strategist, Optimizer, Cost Analyst, Risk/Devil's Advocate) via a small Claude Haiku call, then conditional edges dispatch to the matching specialist node, each built from T-11's `run_agent_query` with its own role-specific system prompt and a restricted tool subset (`ROLE_TOOLS`). Router is dependency-injectable (`classifier` param) so graph wiring/fallback is unit-testable without hitting the API; the real classification only runs in the live-gated tests. Running this live against real questions surfaced 3 more real gaps beyond T-11's, all fixed the same way (route the derivation through the engine instead of trusting the LLM not to compute it): Cost Analyst was dividing transport/fixed by total itself to answer "what's driving cost" (fixed: `cost_to_serve`'s breakdown now includes `transport_cost_pct`/`fixed_cost_pct` directly); the Optimizer specialist added `hubs_open_count + hubs_closed_count` in its head to state the original hub count (fixed: `hubs_total_count` added to both optimizers' rationale); and a KPI question re-derived total demand via `total_cost / cost_to_serve` again despite the earlier prompt tightening — LLMs don't perfectly self-police even a very explicit instruction every single time, which is exactly why the after-the-fact provenance check (not just a system prompt) is the real enforcement (fixed: `total_demand` added directly to `cost_to_serve`'s breakdown). To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_workforce.py -v"` → 4 non-live passed (role/tool wiring, router fallback-to-default, valid-classification passthrough) + 2 live passed (skipped without `ANTHROPIC_API_KEY`): a cost question correctly routes to `cost_analyst` and a hub-closure question to `optimizer`, both answers fully traceable to their tool calls. Full non-live suite → 61 passed (2 live-only deselected).

**T-13 · Goal-driven optimisation loop**
Contract: agent loop over T-09/T-08. Depends on: T-11.
Done when: a plain-English objective ("cut cost 5%, no hub >90%") drives simulate→optimise→evaluate iterations and returns the answer + the path explored.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/goal_loop.py::run_goal_loop(model, objective_text, max_iterations=5)`. One Claude call parses the plain-English objective into `{target_cost_reduction_pct, max_utilization}`; the loop then repeatedly calls the real `optimise_network` tool (T-09's MILP) with a `max_utilization` constraint, relaxing it by 0.05 each round until the target is met or iterations run out — every number in every step comes from a real optimiser call, the LLM only sets the initial target and decides nothing about the search itself (that's pure Python). If no cap was ever given, the loop deliberately stops after one attempt instead of "iterating" on an identical input/output pair. `parse_objective` is dependency-injectable so the search logic is fully unit-testable without touching the API — only the parsing step is live-gated. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_goal_loop.py -v"` → 4 non-live passed against the real T-04 synthetic dataset (unconstrained 5% target met in 1 shot at the real 11.89%; an unreachable 90% target correctly gives up after 1 attempt with no cap to adjust; a genuinely multi-step search — tight 20% cap only allows closing 1 hub for 2.6%, relaxing to 25%/30% allows 2/3 hubs for 5.99%/10.47%, clearing a 10% target in exactly 3 iterations, captured by actually running it, not derived by hand; a max_iterations cutoff that still returns cleanly when the target's unreachable in the given budget). Live test (skipped without `ANTHROPIC_API_KEY`): a real "cut cost by at least 8%, no hub over 25%" objective is parsed correctly and drives a real search. Full non-live suite → 65 passed.

**T-14 · Agent Builder (custom agents + templates)**
Contract: agent = name + goal + allowed registry tools + autonomy mode. Depends on: T-11.
Done when: a new agent can be created (2–3 seeded templates) and works immediately using registry tools; persists; can't answer with non-tool numbers.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/builder.py`: `AgentBuilder` (`create/get/all/tools_for/run`) + `CustomAgentSpec` (name, goal, allowed_tools, autonomy). `create()` rejects any tool name not in `registry.as_agent_tools()` and any autonomy mode outside `{on-demand, monitoring}` — a custom agent structurally cannot be given a tool that doesn't exist, so it mechanically cannot answer with a number no tool could have produced. 3 seeded templates (`seed_default_templates()`): `capacity_watchdog` (monitoring), `cost_advisor`, `whatif_explorer` — all built from real T-11 tools, working immediately. In-memory store for now; same 4-method interface a DB-backed version would need, so T-15's API layer can swap the storage without touching callers. Running the seeded `cost_advisor` live surfaced one more real gap: it derived "new cost-to-serve per parcel" and "savings per parcel" itself from `objective_value / total_demand` and a subtraction (and got the division slightly wrong when eyeballing it) — fixed by having `optimise_network` return `cost_to_serve_before`/`cost_to_serve_after`/`cost_to_serve_savings_per_parcel` directly, closing the same class of gap found repeatedly this phase: whenever an agent reaches for arithmetic, that's a signal the engine should have computed and returned that figure itself. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_agent_builder.py -v"` → 4 non-live passed (unknown tool/autonomy rejected at creation; all 3 templates reference real tools; a custom agent restricted to `find_spare_capacity` mechanically cannot even see `get_kpis`/`optimise_network` — proven by inspecting `tools_for()`'s output directly, not by trusting the LLM to decline). Live test (skipped without `ANTHROPIC_API_KEY`): the seeded `cost_advisor` answers a real cost-savings question fully grounded. Full non-live suite → 69 passed. **All 19 live tests across T-11–T-14 pass together in one run** — see the phase-end message for a full worked transcript.

### Phase 3 — API + Frontend

**T-15 · FastAPI routers**
Contract: REST over engine + agents. Depends on: T-07–T-14 (progressively).
Done when: `/ingest /kpis /simulate /optimize /agent/query /agents (CRUD) /scenarios` work against synthetic data.
Log:

**T-16 · Frontend shell + map**
Contract: Next.js + deck.gl. Depends on: T-15 (kpis/scenarios).
Done when: hubs coloured by utilisation, ArcLayer flows, demand heat; MapLibre basemap (no paid token).
Log:

**T-17 · KPI cards + scenario panel + before/after diff**
Contract: React → API. Depends on: T-16.
Done when: KPI tiles live; scenario controls (toggle hubs, demand/fleet sliders) → Simulate → before/after diff renders.
Log:

**T-18 · Agent chat + Agent Builder panels**
Contract: React → `/agent/query`, `/agents`. Depends on: T-16, T-14.
Done when: chat answers with computed+explained results (shows which tool gave each number); Agent Builder creates an agent live.
Log:

### Phase 4 — Accuracy

**T-19 · Real road distances + H3 zoning**
Contract: `od_matrix` provider. Depends on: T-06.
Done when: OSRM/Valhalla/ORS drive-time matrix populates `od_matrix`; H3 aggregates demand; haversine×1.3 fallback if road engine unavailable.
Log:

**T-20 · Monte Carlo confidence bands**
Contract: wraps optimiser/metrics. Depends on: T-09.
Done when: each recommendation ships a robustness range ("holds under demand ±20%"); pure NumPy; shown in UI + brief.
Log:

### Phase 5 — Signature features

**T-21 · Opportunity scanner**
Contract: agent over metrics/flow. Depends on: T-12.
Done when: proactively surfaces ≥3 inefficiency types (overlapping coverage, far-hub service, idle-next-to-overload) unprompted, each with a computed figure.
Log:

**T-22 · Threshold / break-even finder**
Contract: goal-loop variant. Depends on: T-13.
Done when: answers "at what demand growth does Hub X break? / how many customers before SLA fails?" by searching for the tipping point.
Log:

**T-23 · Prescriptive bottleneck unlock**
Contract: agent over duals (T-08). Depends on: T-08, T-12.
Done when: turns shadow prices into "cheapest unblock = +N units at Hub B, cost X, unlocks Y".
Log:

**T-24 · Auto decision-brief**
Contract: agent + template → export. Depends on: T-09, T-20.
Done when: generates a one-page brief (current state, change, cost/risk, what it unblocks, sensitivity); exportable from the UI.
Log:

### Phase 6 — Stretch (only if core solid)

**T-25 · Demand forecast (Prophet)** — Depends on: T-06 (needs `demand_history`). Done when: twin projects demand forward and the scanner can pre-empt a breach.
Log:

**T-26 · Institutional memory (Qdrant)** — Depends on: T-12. Done when: agents recall past scenarios/decisions semantically.
Log:

**T-27 · SimPy waves** — Depends on: T-08. Done when: the "two delivery waves?" question returns throughput/queue impact.
Log:

### Phase 7 — Event day

**T-28 · Real dataset ingestion + calibration** — Depends on: T-06. Done when: real Excel mapped, loaded, cost model calibrated; open questions in `VISION.md §8c` answered. **(H0–2 on the day.)**
Log:

**T-29 · Baseline validation + sensitivity + sanity checks** — Depends on: T-28. Done when: baseline recovers a sane current cost; saving decomposed; conservation/capacity/coverage checks pass; sensitivity holds.
Log:

**T-30 · Demo seed scenario + pitch + Q&A rehearsal** — Depends on: all core. Done when: one always-renders scenario seeded; pitch built; `VISION.md §8b` answers rehearsed out loud.
Log:

---

## Leader's follow-up loop (Sims)

- Scan the **Index** — anything in `REVIEW` is waiting on you; anything `BLOCKED` needs unblocking now.
- To review: pull the branch, confirm it registers, run its fixture test, check it against "Done when." Then set `DONE` or bounce it back to `WIP` with a log note.
- Protect the build order: don't let Phase 5/6 tickets go `WIP` while Phase 0–1 has open tickets.
- The one check that overrides everything: does any agent output a number that didn't come from a tool? If yes, that ticket is not `DONE`, no matter how good it looks.
