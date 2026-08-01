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
| T-11 | LangGraph agent tools wrapping the engine | 2 Agents | B | DONE |
| T-12 | Multi-agent workforce graph | 2 Agents | B | DONE |
| T-13 | Goal-driven optimisation loop | 2 Agents | B | DONE |
| T-14 | Agent Builder (custom agents + templates) | 2 Agents | B | DONE |
| T-15 | FastAPI routers | 3 API/UI | B/C | DONE |
| T-16 | Frontend shell + map (deck.gl) | 3 API/UI | C | DONE |
| T-17 | KPI cards + scenario panel + before/after diff | 3 API/UI | C | DONE |
| T-18 | Agent chat + Agent Builder panels | 3 API/UI | C | DONE |
| T-19 | Real road distances + H3 zoning | 4 Accuracy | D | REVIEW |
| T-20 | Monte Carlo confidence bands | 4 Accuracy | D | REVIEW |
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
- FOLLOW-UP — Claude — 2026-08-01 — Wired `ANTHROPIC_API_KEY` through `docker-compose.yml` (references `${ANTHROPIC_API_KEY}`, actual value stays in the gitignored `.env`) so `docker compose run backend pytest` can exercise the live tests, not just plain `docker run`. Running the **entire** T-11–T-14 live suite together (not each file in isolation) surfaced 2 more of the same class of gap: `get_kpis` didn't expose hub/zone/emirate counts, so agents kept counting breakdown dict entries themselves ("across 7 emirates", "your 9 hubs") — fixed by adding a `network_summary` block (`hub_count`, `open_hub_count`, `zone_count`, `emirate_count`, `total_demand`) directly to `get_kpis`'s output. That in turn broke `simulate_scenario`/`compare_scenarios`'s delta computation, which assumed every top-level `get_kpis` key was a `{"value": ...}`-shaped `MetricResult` — fixed to skip non-metric keys. Confirmed stable across 2 consecutive full live runs (77/77 passed both times, incl. `test_db.py`) before calling this phase done.
- DONE — Sims — 2026-08-01

**T-12 · Multi-agent workforce graph**
Contract: LangGraph graph. Depends on: T-11.
Done when: Network Analyst / Scenario Strategist / Optimizer / Cost Analyst / Risk agents collaborate to answer a question, every number traceable to a tool call.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/workforce.py`: a genuine LangGraph `StateGraph` — a `route` node classifies the question into one of 5 roles (Network Analyst, Scenario Strategist, Optimizer, Cost Analyst, Risk/Devil's Advocate) via a small Claude Haiku call, then conditional edges dispatch to the matching specialist node, each built from T-11's `run_agent_query` with its own role-specific system prompt and a restricted tool subset (`ROLE_TOOLS`). Router is dependency-injectable (`classifier` param) so graph wiring/fallback is unit-testable without hitting the API; the real classification only runs in the live-gated tests. Running this live against real questions surfaced 3 more real gaps beyond T-11's, all fixed the same way (route the derivation through the engine instead of trusting the LLM not to compute it): Cost Analyst was dividing transport/fixed by total itself to answer "what's driving cost" (fixed: `cost_to_serve`'s breakdown now includes `transport_cost_pct`/`fixed_cost_pct` directly); the Optimizer specialist added `hubs_open_count + hubs_closed_count` in its head to state the original hub count (fixed: `hubs_total_count` added to both optimizers' rationale); and a KPI question re-derived total demand via `total_cost / cost_to_serve` again despite the earlier prompt tightening — LLMs don't perfectly self-police even a very explicit instruction every single time, which is exactly why the after-the-fact provenance check (not just a system prompt) is the real enforcement (fixed: `total_demand` added directly to `cost_to_serve`'s breakdown). To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_workforce.py -v"` → 4 non-live passed (role/tool wiring, router fallback-to-default, valid-classification passthrough) + 2 live passed (skipped without `ANTHROPIC_API_KEY`): a cost question correctly routes to `cost_analyst` and a hub-closure question to `optimizer`, both answers fully traceable to their tool calls. Full non-live suite → 61 passed (2 live-only deselected).
- DONE — Sims — 2026-08-01

**T-13 · Goal-driven optimisation loop**
Contract: agent loop over T-09/T-08. Depends on: T-11.
Done when: a plain-English objective ("cut cost 5%, no hub >90%") drives simulate→optimise→evaluate iterations and returns the answer + the path explored.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/goal_loop.py::run_goal_loop(model, objective_text, max_iterations=5)`. One Claude call parses the plain-English objective into `{target_cost_reduction_pct, max_utilization}`; the loop then repeatedly calls the real `optimise_network` tool (T-09's MILP) with a `max_utilization` constraint, relaxing it by 0.05 each round until the target is met or iterations run out — every number in every step comes from a real optimiser call, the LLM only sets the initial target and decides nothing about the search itself (that's pure Python). If no cap was ever given, the loop deliberately stops after one attempt instead of "iterating" on an identical input/output pair. `parse_objective` is dependency-injectable so the search logic is fully unit-testable without touching the API — only the parsing step is live-gated. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_goal_loop.py -v"` → 4 non-live passed against the real T-04 synthetic dataset (unconstrained 5% target met in 1 shot at the real 11.89%; an unreachable 90% target correctly gives up after 1 attempt with no cap to adjust; a genuinely multi-step search — tight 20% cap only allows closing 1 hub for 2.6%, relaxing to 25%/30% allows 2/3 hubs for 5.99%/10.47%, clearing a 10% target in exactly 3 iterations, captured by actually running it, not derived by hand; a max_iterations cutoff that still returns cleanly when the target's unreachable in the given budget). Live test (skipped without `ANTHROPIC_API_KEY`): a real "cut cost by at least 8%, no hub over 25%" objective is parsed correctly and drives a real search. Full non-live suite → 65 passed.
- DONE — Sims — 2026-08-01

**T-14 · Agent Builder (custom agents + templates)**
Contract: agent = name + goal + allowed registry tools + autonomy mode. Depends on: T-11.
Done when: a new agent can be created (2–3 seeded templates) and works immediately using registry tools; persists; can't answer with non-tool numbers.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/builder.py`: `AgentBuilder` (`create/get/all/tools_for/run`) + `CustomAgentSpec` (name, goal, allowed_tools, autonomy). `create()` rejects any tool name not in `registry.as_agent_tools()` and any autonomy mode outside `{on-demand, monitoring}` — a custom agent structurally cannot be given a tool that doesn't exist, so it mechanically cannot answer with a number no tool could have produced. 3 seeded templates (`seed_default_templates()`): `capacity_watchdog` (monitoring), `cost_advisor`, `whatif_explorer` — all built from real T-11 tools, working immediately. In-memory store for now; same 4-method interface a DB-backed version would need, so T-15's API layer can swap the storage without touching callers. Running the seeded `cost_advisor` live surfaced one more real gap: it derived "new cost-to-serve per parcel" and "savings per parcel" itself from `objective_value / total_demand` and a subtraction (and got the division slightly wrong when eyeballing it) — fixed by having `optimise_network` return `cost_to_serve_before`/`cost_to_serve_after`/`cost_to_serve_savings_per_parcel` directly, closing the same class of gap found repeatedly this phase: whenever an agent reaches for arithmetic, that's a signal the engine should have computed and returned that figure itself. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_agent_builder.py -v"` → 4 non-live passed (unknown tool/autonomy rejected at creation; all 3 templates reference real tools; a custom agent restricted to `find_spare_capacity` mechanically cannot even see `get_kpis`/`optimise_network` — proven by inspecting `tools_for()`'s output directly, not by trusting the LLM to decline). Live test (skipped without `ANTHROPIC_API_KEY`): the seeded `cost_advisor` answers a real cost-savings question fully grounded. Full non-live suite → 69 passed. **All 19 live tests across T-11–T-14 pass together in one run** — see the phase-end message for a full worked transcript.
- DONE — Sims — 2026-08-01

### Phase 3 — API + Frontend

**T-15 · FastAPI routers**
Contract: REST over engine + agents. Depends on: T-07–T-14 (progressively).
Done when: `/ingest /kpis /simulate /optimize /agent/query /agents (CRUD) /scenarios` work against synthetic data.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/api/routers/`: `kpis.py` (`GET /kpis`), `simulate.py` (`POST /simulate`, `save_as` persists a named scenario), `optimize.py` (`POST /optimize`), `scenarios.py` (`GET /scenarios`), `ingest.py` (`POST /ingest`, Excel upload → replaces baseline), `agents.py` (`POST /agent/query` + full `/agents` CRUD), plus one addition beyond the literal endpoint list: `network.py` (`GET /network` — hubs/zones/flows with coordinates, since none of the named endpoints expose geography and T-16's map can't render without it). Every router is a thin pass-through to the already-tested T-11 agent tools / T-06-T-10 engine — the API layer adds no computation of its own, only HTTP plumbing, so "the engine computes" holds at this layer too. `hubris/api/state.py`: one process-wide `AppState` (baseline + named scenarios) — the right scope for BUILD_SPEC §12's single-demo-scenario framing, swappable for per-session/DB-backed state later without touching routers. Extended `AgentBuilder` with `update`/`delete` and made `create` reject duplicates (409) so `/agents` has real CRUD semantics, not just create+read. `/agent/query` and custom-agent responses preserve the full `tool_calls` trace (tool name, args, and the **parsed JSON** result, not a double-encoded string) so the frontend can tag each number with its source. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_api.py -v"` → 12 non-live passed against the real synthetic dataset (kpis/simulate/optimize numbers match T-07/T-09's own hand-checked values exactly; save_as scenario round-trips through a fresh GET; ingest replaces the baseline with a 2-hub/3-zone Excel upload; full agents CRUD lifecycle incl. 409 on duplicate + 400 on unknown tool) + 2 live passed (skipped without `ANTHROPIC_API_KEY`): workforce and custom-agent queries both return parsed-JSON tool results. Full stack verified with a real `docker compose up` (not just TestClient) — server starts cleanly under the new lifespan hook, `/health` and `/kpis` respond over real HTTP. Full suite (`db` up + migrated) → 91 passed.
- DONE — Sims — 2026-08-01

**T-16 · Frontend shell + map**
Contract: Next.js + deck.gl. Depends on: T-15 (kpis/scenarios).
Done when: hubs coloured by utilisation, ArcLayer flows, demand heat; MapLibre basemap (no paid token).
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `frontend/components/NetworkMap.tsx`: deck.gl (`ScatterplotLayer` for hubs, `ArcLayer` for hub→zone flows, `HeatmapLayer` for zone demand) over a react-map-gl/MapLibre basemap, fed entirely by `GET /network` (T-15's new endpoint). Hubs coloured green→amber→red by `utilization_pct` (closed hubs render grey regardless of utilization), sized by `sqrt(capacity)`; click opens a tooltip with utilization/capacity/spare/cost-to-serve — the last one didn't exist anywhere in the engine yet, so added `cost_to_serve_by_hub()` to `hubris/engine/assignment.py` (per-hub AED/parcel, hand-checked: 31.6/102.0 on the tiny fixture) and wired it through `/network`, keeping the honesty rule intact (server-computed, never derived in the browser). `frontend/lib/api.ts`/`types.ts`: a thin typed fetch client mirroring the Pydantic schemas exactly — every field the UI can show has a named type, nothing untyped/`any` flows through. Basemap: switched from CARTO's hosted vector `style.json` to an inline raster-tile style after actually testing it live — the hosted vector style's schema wasn't rendering under maplibre-gl v6 (tiles never got requested, no error thrown either — silently blank), while raster XYZ tiles have no such compatibility surface and are the standard `deck.gl` "no-token basemap" pattern anyway. Caught entirely by the frontend-testing convention: to test: `cd frontend && npm run build` (typecheck + build clean) then `docker compose up -d --build`, or `npm run dev`; then actually drove it with Playwright (headless Chromium, no `chromium-cli` in this environment) against the live stack rather than trusting the build — first pass showed a completely blank grey basemap despite the style.json fetching 200 OK, root-caused by inspecting network requests (the TileJSON's actual `.mvt` tile URLs were never even requested), fixed via the raster swap, then re-verified: real UAE coastline/cities render, hub circles are correctly green/amber-coloured and capacity-sized, blue arc flow lines and orange/red demand-heat blobs both visible, and a real click on a hub ("Ajman Hub 6 (H6)") produced a tooltip with all 4 required fields populated with real numbers (Utilization: 14.7%, Capacity: 2,878 parcels, Spare: 2,455 parcels, Cost-to-serve: 47.85 AED/parcel) matching what `/network` actually returns. Backend regression: `docker run ... pytest tests/ -k "not routes_to and not live and not seeded_cost"` → 83 passed (incl. 2 new hand-checked `cost_to_serve_by_hub` tests).
- DONE — Sims — 2026-08-01

**T-17 · KPI cards + scenario panel + before/after diff**
Contract: React → API. Depends on: T-16.
Done when: KPI tiles live; scenario controls (toggle hubs, demand/fleet sliders) → Simulate → before/after diff renders.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `frontend/components/KpiCards.tsx` (cost-to-serve, avg utilization, coverage, spare capacity — all 4 read straight from `GET /kpis`), `ScenarioPanel.tsx` (3 tabs: close a hub via dropdown, demand-growth via a -30%..+100% slider, fleet-mix via fleet-type dropdown + vehicle-count slider — all three map onto real T-10 scenario modules and call `POST /simulate`), `ScenarioDiff.tsx` (before→after values + coloured % delta per metric, green/red only where a direction is unambiguously good/bad — cost down and coverage up are coloured, utilization/spare capacity are shown neutrally since more or less can both be desirable depending on intent). One deliberate scope cut, flagged rather than faked: BUILD_SPEC §10 also lists a "% of decisions answerable on-platform" KPI card — no engine metric computes that yet (it needs the 10-canonical-question checklist infrastructure from BUILD_SPEC §11, not built), and the phase's own explicit rule is "never hardcoded, never client-computed," so it's omitted rather than faked with a placeholder number. Extended `GET /network` with `fleet_types` (needed for the fleet-mix dropdown) — new response field, backward compatible. To test: `cd frontend && npm run build` (typecheck+build clean); backend regression `docker run ... pytest tests/ -k "not routes_to and not live and not seeded_cost"` → 83 passed. Drove the real running stack with Playwright end-to-end and watched real numbers move: closing H1 → cost-to-serve 57.09→55.56 AED/parcel (-2.7%, green), utilization 15.89→17.61% (+10.8%), coverage unchanged (0.0%, correctly neutral — caught and fixed a bug here: 0% deltas were rendering red/"−0.0%" due to floating-point noise near zero, fixed with a 0.05% negligible-change threshold shared by the colour and text formatting); +40% demand growth → cost-to-serve drops to 49.62 (-13.1%, fixed costs amortising over more volume, consistent with T-10's own findings); fleet-mix changes correctly show exactly 0.0% impact on all 4 KPIs — an honest reflection that fleet composition isn't wired into any current metric's calculation, not a bug to paper over.
- DONE — Sims — 2026-08-01

**T-18 · Agent chat + Agent Builder panels**
Contract: React → `/agent/query`, `/agents`. Depends on: T-16, T-14.
Done when: chat answers with computed+explained results (shows which tool gave each number); Agent Builder creates an agent live.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `frontend/components/AgentChat.tsx`: a chat panel with a dropdown to pick the workforce (auto-routed) or any custom agent, calling `POST /agent/query`; every agent message renders `source: <tool>` badges beneath it (one per T-11 tool call in the response's `tool_calls` trace) that expand on click to the exact computed JSON that tool returned — this is the literal mechanism for "shows which tool gave each number," not a description of it. `AgentBuilderPanel.tsx`: lists existing custom agents with delete buttons, and a create form (name, goal, tool checkboxes drawn from the 5 real T-11 tools, autonomy dropdown) posting to `POST /agents`; newly-created agents appear immediately in both the builder's list and the chat's agent dropdown, with no reload. Sidebar reorganised into Scenario/Agents tabs (T-17's panels + T-18's now both fit without a mile-long scroll). To test: `cd frontend && npm run build` (typecheck+build clean); backend regression `docker run ... pytest tests/ -k "not routes_to and not live and not seeded_cost"` → 83 passed; full suite incl. `db` + all live agent tests → 93 passed. Drove the real stack live end-to-end with Playwright: asked the workforce "Should we close any hubs to save cost?" → correctly routed to `Agent (optimizer)`, answered with the same real recommendation as T-12's own test (close H1/H3/H5/H7, 11.89% reduction) with a `source: optimise_network` badge; clicked it and confirmed via DOM inspection (0 `<pre>` elements before, 1 after, containing the real tool JSON) that it expands to the actual computed result, not a placeholder; created a custom agent live via the builder form and confirmed it appeared in both the agent list and the chat dropdown immediately, then deleted it and confirmed it vanished from both. **This closes Phase 3 (T-15–T-18)** — see the phase-end message for exactly how to run the full stack locally.
- DONE — Sims — 2026-08-01

### Phase 4 — Accuracy

**T-19 · Real road distances + H3 zoning**
Contract: `od_matrix` provider. Depends on: T-06.
Done when: OSRM/Valhalla/ORS drive-time matrix populates `od_matrix`; H3 aggregates demand; haversine×1.3 fallback if road engine unavailable.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/engine/routing.py`: `refresh_od_matrix(model, use_osrm=True)` rebuilds `od_matrix` from OSRM's public Table API (one batched hub×zone call), returning `(updated_model, mode)` where `mode` is `"osrm"` or `"haversine_fallback"` for the *whole* batch — never a silent per-pair mix — on any network error, non-OK response, or unreachable pair it falls back to the existing haversine×1.3 path (`hubris/engine/geo.py`) so the app never hangs or half-updates. `backend/hubris/engine/h3_zoning.py`: `aggregate_to_h3_zones(points, resolution)` collapses raw lat/lon demand points onto an H3 hex grid (cell centroid as coordinates, demand summed, tightest SLA kept), wired into `ExcelDataConnector.load(..., aggregate_zones_to_h3=False, h3_resolution=7)` — opt-in, defaults off so existing ingestion behaviour is unchanged. `AppState.distance_mode` (default `"haversine_fallback"`, since the synthetic baseline uses the same haversine formula) is now exposed on `GET /network`'s response and updated by the new `POST /network/refresh-distances` endpoint, which reruns `refresh_od_matrix` against the live baseline and reports `cost_to_serve_before`/`cost_to_serve_after` so the shift is always visible, never inferred. Frontend: a badge in the header ("REAL ROAD DISTANCES" green / "HAVERSINE FALLBACK" amber) reads `distance_mode` straight off `GET /network`, plus a "Refresh real distances" button driving the new endpoint and displaying the before/after cost-to-serve inline — no client-side computation of either number. To test: `docker run --rm -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest backend/tests/ --ignore=backend/tests/test_db.py -v` → 93 passed, 9 skipped (skips are the live-OSRM/live-agent tests when network/API key aren't available — all ran and passed here); `cd frontend && npx tsc --noEmit` clean. Drove the real stack live (Docker Compose + Playwright against `localhost:3000`/`localhost:8000`, hitting the actual public OSRM server, no mocks): badge showed "HAVERSINE FALLBACK" on load, clicking "Refresh real distances" flipped it to "REAL ROAD DISTANCES" and the header showed **cost-to-serve 57.0949 → 65.1826 AED/parcel** (+14.2%) — real road distances replacing haversine raised the baseline cost, as expected once actual road geometry (not straight lines) is priced in.

**T-20 · Monte Carlo confidence bands**
Contract: wraps optimiser/metrics. Depends on: T-09.
Done when: each recommendation ships a robustness range ("holds under demand ±20%"); pure NumPy; shown in UI + brief.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/engine/monte_carlo.py`: `compute_robustness_band(model, demand_variation_pct=20.0, trials=50, seed=42)` — pure NumPy, perturbs each zone's demand independently by a uniform ±`demand_variation_pct`% draw per trial and re-solves the FAST min-cost flow LP (`hubris.engine.flow.solve_min_cost_flow`, not the MILP — re-optimising hub open/close per trial isn't the question and would be far too slow for a UI-facing sweep), returning `RobustnessBand` (`cost_to_serve_p10/p50/p90`, `feasible_pct`, `holds_under_variation`). Fixed seed -> identical inputs always produce an identical band (hand-checked in `test_monte_carlo.py`: a tight-capacity fixture is correctly flagged `holds_under_variation=False`, an ample-capacity one holds at 100% feasible, 0% variation collapses the band to a single point). `apply_recommendation_changes(model, changes)` flips hub open/close status per a `Recommendation.changes` list so the band is computed on the network the optimiser actually recommends, not the pre-recommendation baseline. Wired into `OptimiseNetworkTool.run()` (`backend/hubris/agents/tools/optimise_network.py`) — every `optimise_network` call now returns a `robustness` field by default (documented in the tool's `description` so the agent can reference it without guessing), with an optional `demand_variation_pct` input. Carried through `goal_loop.py`'s `path` steps (each iteration's robustness band, not just the final one) and the `/optimize` endpoint (`OptimizeResponse.robustness`, `OptimizeRequest.demand_variation_pct`). `workforce.py`'s `risk_analyst` role (explicitly scoped to "stress-testing... robustness, worst-case questions") gained `optimise_network` as an allowed tool — it previously had no way to reach the one tool that actually computes a robustness band. Frontend: new `OptimizerPanel.tsx` (Scenario tab) — a "Run optimizer" button hits `/optimize` and renders the recommended changes, cost-to-serve before/after, and a "ROBUST UNDER ±X% DEMAND" / "AT RISK" badge plus the p10-p90 cost range and feasible-trial % straight from the API response — no client-side computation. To test: `docker run --rm -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest backend/tests/ --ignore=backend/tests/test_db.py -v` → 100 passed, 9 skipped; `cd frontend && npx tsc --noEmit` clean. Drove the real stack live (Docker Compose + Playwright, no mocks): clicked "Run optimizer" against the full 9-hub/100-zone synthetic dataset and got the real T-09 recommendation (close H1/H3/H5/H7) with cost-to-serve 57.09 → 50.30 AED/parcel, plus a computed Monte Carlo band — "ROBUST UNDER ±20% DEMAND", cost-to-serve range 35.88–36.44 AED/parcel (median 36.11) across 50 trials, feasible in 100% of trials — confirming the resulting 5-hub network comfortably absorbs demand swings.

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
