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
| T-19 | Real road distances + H3 zoning | 4 Accuracy | D | DONE |
| T-20 | Monte Carlo confidence bands | 4 Accuracy | D | DONE |
| T-21 | Opportunity scanner | 5 Signature | B | REVIEW |
| T-22 | Threshold / break-even finder | 5 Signature | B | REVIEW |
| T-23 | Prescriptive bottleneck unlock (duals → action) | 5 Signature | B | REVIEW |
| T-24 | Auto decision-brief | 5 Signature | B/C | REVIEW |
| T-25 | Demand forecast (Prophet) | 6 Stretch | D | TODO |
| T-26 | Institutional memory (Qdrant) | 6 Stretch | B | TODO |
| T-27 | SimPy waves | 6 Stretch | A | TODO |
| T-28 | Real dataset ingestion + calibration (EVENT DAY) | 7 Event | A | REVIEW |
| T-29 | Baseline validation + sensitivity + sanity checks | 7 Event | A/D | REVIEW |
| T-30 | Demo seed scenario + pitch + Q&A rehearsal | 7 Event | L | TODO |
| **T-33** | **W1 · Runtime provenance verification** | **8 Integrity** | **A** | **DONE** |
| T-34 | Wire the goal-driven loop (tool + route + UI) | 8 Integrity | B | DONE |
| T-35 | Turn on H3 zoning in /ingest | 8 Integrity | A | DONE |
| T-36 | Expose all 6 scenarios in ScenarioPanel | 8 Integrity | C (Nathi) | TODO |
| T-37 | Fix the >100% utilisation artifact | 8 Integrity | A | DONE |
| T-31 | Reconstructed-baseline labelling | 8 Integrity | B | DONE |
| T-32 | Evidence-labelling of engine inputs | 8 Integrity | A | DONE |
| T-38 | W2a · Memory core (schema, store, episodic) | 9 Learning | B | DONE |
| T-39 | W2b · Semantic + procedural + agent heuristics | 9 Learning | B | DONE |
| T-40 | W4 · Closed-loop autonomous monitoring | 9 Learning | B | REVIEW |
| ~~T-41~~ | ~~W5 · Multi-agent swarm + adversarial review~~ | 9 Learning | — | **CUT — Sims — 2026-08-04** |
| T-42 | W3 · Time Machine (temporal navigation) | 9 Learning | C | TODO |
| T-43 | W6 · Hubris as an MCP server | 9 Learning | A | REVIEW |
| T-44 | Live-agent CI path (guardrail regression) | 8 Integrity | A | DONE |

**Build order:** finish Phase 0 → 1 before anything else (it's the critical path). Phases 2 and 3 can run in parallel once 0–1 exist. Phase 4 as soon as the engine is stable. Phase 5 is the differentiator — do it before stretch. Phase 6 only if core is solid. Phase 7 is the event day itself.

> **Superseding rule (post-audit):** **T-33 outranks everything above.** The `STATUS.md`
> audit measured agents fabricating numbers in 3 of 5 live runs with no runtime check to
> catch it. Until the provenance gate is live, every other ticket is building on a claim we
> cannot currently defend. See the **BUILD PLAN** at the end of this file for wave ordering,
> parallelism and risk flags.

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
- DONE — Sims — 2026-08-01
- RESILIENCE CHECK — Claude — 2026-08-01 — added `OSRM_BASE_URL` (defaulting to `routing.py`'s own public-server default) as a `docker-compose.yml` backend env var, so a self-hosted OSRM can be swapped in with zero code change. Simulated OSRM being unreachable against the LIVE running stack (not just unit tests) two ways: (1) restarted the backend with `OSRM_BASE_URL=http://127.0.0.1:1` (instant connection-refused) — `POST /network/refresh-distances` returned in 73ms with `distance_mode: "haversine_fallback"`, `od_pairs_updated: 900`, no error; (2) restarted with `OSRM_BASE_URL=http://10.255.255.1` (a black-hole IP that times out rather than refuses) and `OSRM_TIMEOUT_SECONDS=2` — the call returned in 2.09s, still cleanly falling back, no hang, no 500. Both `cost_to_serve_before`/`after` came back identical (57.0949) because the fallback formula is the same haversine×1.3 the synthetic baseline was already built with — a useful self-consistency check. Reverted the backend to the public default afterward and confirmed `/network` reports `haversine_fallback` cleanly again with a fresh baseline.
  **Recommendation: self-host a UAE OSRM extract for the event, don't depend on the public server.** The public `router.project-osrm.org` demo server is explicitly rate-limited and licensed for light/non-production use only (OSRM's own usage policy) — fine for this session's development/testing, risky for a live judged demo where latency spikes or a rate-limit block would surface as an unexplained fallback mid-pitch. A UAE-only OSM extract is small (low tens of MB, not the ~1GB+ full-planet file) and `osrm-backend`'s standard Docker image (`osrm/osrm-backend`) turns it into a runnable routing server in three CLI steps (extract → partition → customize) — a one-time ~10-15 minute setup, not an ongoing maintenance burden. With `OSRM_BASE_URL` now wired through compose, switching is a one-line env change (e.g. `OSRM_BASE_URL=http://osrm:5000`) and no code touches. Given the fallback is already proven clean either way, this isn't a correctness requirement — it's a demo-day reliability upgrade (consistent low latency, no shared-server rate limit, no dependency on outside network conditions during the pitch). Recommend doing it before the event if there's an hour to spare; not blocking Phase 5.

**T-20 · Monte Carlo confidence bands**
Contract: wraps optimiser/metrics. Depends on: T-09.
Done when: each recommendation ships a robustness range ("holds under demand ±20%"); pure NumPy; shown in UI + brief.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/engine/monte_carlo.py`: `compute_robustness_band(model, demand_variation_pct=20.0, trials=50, seed=42)` — pure NumPy, perturbs each zone's demand independently by a uniform ±`demand_variation_pct`% draw per trial and re-solves the FAST min-cost flow LP (`hubris.engine.flow.solve_min_cost_flow`, not the MILP — re-optimising hub open/close per trial isn't the question and would be far too slow for a UI-facing sweep), returning `RobustnessBand` (`cost_to_serve_p10/p50/p90`, `feasible_pct`, `holds_under_variation`). Fixed seed -> identical inputs always produce an identical band (hand-checked in `test_monte_carlo.py`: a tight-capacity fixture is correctly flagged `holds_under_variation=False`, an ample-capacity one holds at 100% feasible, 0% variation collapses the band to a single point). `apply_recommendation_changes(model, changes)` flips hub open/close status per a `Recommendation.changes` list so the band is computed on the network the optimiser actually recommends, not the pre-recommendation baseline. Wired into `OptimiseNetworkTool.run()` (`backend/hubris/agents/tools/optimise_network.py`) — every `optimise_network` call now returns a `robustness` field by default (documented in the tool's `description` so the agent can reference it without guessing), with an optional `demand_variation_pct` input. Carried through `goal_loop.py`'s `path` steps (each iteration's robustness band, not just the final one) and the `/optimize` endpoint (`OptimizeResponse.robustness`, `OptimizeRequest.demand_variation_pct`). `workforce.py`'s `risk_analyst` role (explicitly scoped to "stress-testing... robustness, worst-case questions") gained `optimise_network` as an allowed tool — it previously had no way to reach the one tool that actually computes a robustness band. Frontend: new `OptimizerPanel.tsx` (Scenario tab) — a "Run optimizer" button hits `/optimize` and renders the recommended changes, cost-to-serve before/after, and a "ROBUST UNDER ±X% DEMAND" / "AT RISK" badge plus the p10-p90 cost range and feasible-trial % straight from the API response — no client-side computation. To test: `docker run --rm -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest backend/tests/ --ignore=backend/tests/test_db.py -v` → 100 passed, 9 skipped; `cd frontend && npx tsc --noEmit` clean. Drove the real stack live (Docker Compose + Playwright, no mocks): clicked "Run optimizer" against the full 9-hub/100-zone synthetic dataset and got the real T-09 recommendation (close H1/H3/H5/H7) with cost-to-serve 57.09 → 50.30 AED/parcel, plus a computed Monte Carlo band — "ROBUST UNDER ±20% DEMAND", cost-to-serve range 35.88–36.44 AED/parcel (median 36.11) across 50 trials, feasible in 100% of trials — confirming the resulting 5-hub network comfortably absorbs demand swings.
- DONE — Sims — 2026-08-01

### Phase 5 — Signature features

**T-21 · Opportunity scanner**
Contract: agent over metrics/flow. Depends on: T-12.
Done when: proactively surfaces ≥3 inefficiency types (overlapping coverage, far-hub service, idle-next-to-overload) unprompted, each with a computed figure.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/engine/opportunities.py` implements all three inefficiency types the ticket names, each with a computed figure and a plain-Python-formatted `why` string (never LLM-generated, so the scanner is trustworthy even with no agent in the loop): **overlapping_coverage** — two open hubs whose PRIMARY catchments (SLA-reachable AND within 15% of the cheapest cost for a zone — deliberately tighter than raw SLA reachability, which UAE's generous 24h SLA windows make nearly universal for any hub pair regardless of distance, discovered while tuning this against the real dataset) overlap on ≥3 zones; **far_hub_service** — zones in the CURRENT operational assignment (`model.assignments`) that aren't at their cheapest available hub, catching cases where a distance-nearest baseline picked a hub that isn't cost-cheapest once handling_cost differs; **idle_next_to_overload** — a hub running hot RELATIVE TO THE NETWORK'S OWN AVERAGE utilization (not a fixed absolute cutoff, so this still finds real imbalance on a lightly-loaded network) next to a nearby idle one. `find_displaced_zones` is shared with T-23's bottleneck unlock. Wrapped as `ScanOpportunitiesTool` (`scan_opportunities`), registered, added to `workforce.py`'s `network_analyst` role. New `GET /opportunities` endpoint + frontend `InsightsPanel.tsx` (new "Insights" sidebar tab). To test: `docker run --rm -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest backend/tests/ --ignore=backend/tests/test_db.py -v` → 109 passed, 9 skipped; `cd frontend && npx tsc --noEmit` clean. **Live scan on the full T-04 synthetic dataset** (see phase-end message for the full output): 2 of 3 types fire — 4 overlapping-coverage pairs (e.g. H5/H6 share 9 zones, 409 parcels/period, 6.1km apart) and 3 idle-next-to-overload findings (H5 at 36.76% utilization vs a 17.4% network average, with H4/H8/H9 sitting near-idle nearby); far_hub_service is honestly empty on this seed — the synthetic baseline's nearest-hub heuristic already happens to be near-cost-optimal (the one real near-miss, zone Z26 at a 0.68 AED/unit excess, is correctly filtered as noise below the 1.0 AED/unit materiality threshold) — verified the finder actually works via a dedicated fixture in `test_opportunities.py` that forces a large, obvious excess.

**T-22 · Threshold / break-even finder**
Contract: goal-loop variant. Depends on: T-13.
Done when: answers "at what demand growth does Hub X break? / how many customers before SLA fails?" by searching for the tipping point.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/threshold_finder.py`, a goal-loop variant (exponential search for a bounding range, then binary search to `tolerance`) over the REAL engine — every trial re-solves `solve_min_cost_flow`, nothing extrapolated. `find_demand_growth_break(model, hub_id)`: scales ONLY that hub's currently-assigned zones and finds the smallest growth factor at which its own T-08 dual first goes nonzero (capacity genuinely binds) — hand-checked on the tiny fixture (H1: assigned demand 50 vs capacity 100 → true breakeven exactly 2.0x; search converges to 1.99–2.02). `find_customer_count_break(model, emirate)`: adds synthetic customers one at a time — placed via a deterministic golden-angle spiral around the emirate's own existing zone centroid (no RNG, no hardcoded UAE coordinates, so this works on any ingested dataset) with demand/SLA drawn from that emirate's own average/most-common values — until real unmet demand first appears; reports a `served_pct` computed directly from the flow (volume-weighted), not the existing per-zone `coverage` metric, which would misleadingly still show ~100% for a zone that's mostly-but-not-fully served (caught this while hand-checking against the tiny fixture — a good example of why every number here traces to a specific engine computation instead of reusing a metric whose definition doesn't quite match the question). Wrapped as two agent tools (`find_demand_growth_break`, `find_customer_count_break`), registered, added to `risk_analyst` (its "at what point does X break" scope). Two new endpoints: `GET /threshold/demand-growth`, `GET /threshold/customer-count`. Frontend: a "Break-even finder" section in the Insights tab (hub-select + "at what growth does it break?" / emirate-select + "how many customers before SLA fails?"). To test: `docker run --rm -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest backend/tests/ --ignore=backend/tests/test_db.py -v` → 120 passed, 9 skipped; `cd frontend && npx tsc --noEmit` clean. **Live results on the full T-04 synthetic dataset**: every hub has a distinct, sensible demand-growth breakeven (H5, already the most-utilized hub per T-21's scan, breaks first at just +172.66% growth; H4 holds to +804.69%) — directly cross-validates T-21's "H5 is running hot" finding from a completely different computation path. Customer-count-break honestly reports "not found" for every single emirate within 64 added customers on the full network — the network currently has enough cross-emirate reroute headroom (generous 12/24/48h SLA windows) that no single emirate's growth alone exhausts it; verified the search itself genuinely works via the tiny fixture's hand-computed 6-customer threshold.

**T-23 · Prescriptive bottleneck unlock**
Contract: agent over duals (T-08). Depends on: T-08, T-12.
Done when: turns shadow prices into "cheapest unblock = +N units at Hub B, cost X, unlocks Y".
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/engine/bottleneck.py`. Duals (T-08) are only exact for a single unit of relaxation, so per CLAUDE.md's determinism rule they're used to RANK candidate binding hubs only — the reported `verified_cost_savings`, `unlock_units`, and `unlocked_zone_ids` all come from actually re-solving `solve_min_cost_flow` with each candidate's capacity raised, never a linear extrapolation of the dual. Needed its own `find_displaced_flow_volumes` rather than reusing T-21's zone-level `find_displaced_zones`: a zone whose demand is SPLIT by a binding constraint (some units still at its cheapest hub, some pushed elsewhere) has a dominant hub that's still technically its cheapest option, so the zone-level view would miss exactly the displaced slice that matters here — this works unit-for-unit directly off `flow.flows`. Hand-checked against test_flow.py's own pre-existing binding fixture (H1 capacity dropped to 40 → total_cost 2700.0, 10 units of Z1 pushed onto H2): the tool independently re-derives `unlock_units=10.0`, and re-solving at the unlocked capacity (50) lands exactly back at the fixture's own unconstrained baseline (700.0) → `verified_cost_savings=2000.0`, matching a fully independent hand computation. Wrapped as `find_bottleneck_unlock`, registered, added to `network_analyst` (its "find bottlenecks" scope). New `GET /bottleneck` endpoint. Frontend: a "Bottleneck unlock" section in the Insights tab ("Find cheapest unlock" button). To test: `docker run --rm -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest backend/tests/ --ignore=backend/tests/test_db.py -v` → 127 passed, 9 skipped; `cd frontend && npx tsc --noEmit` clean. **Live on the full T-04 dataset**: baseline correctly reports nothing binding (matches T-21/T-22's finding that the network currently has headroom everywhere); after stressing it via `POST /simulate {demand_scale, factor:5.0}` (a real API call, not a shortcut), 2 hubs bind, and H5 — the same hub T-21/T-22 already flagged as running hottest — comes back as the cheapest verified unlock: +1279 units of capacity there recaptures 6 zones and saves 3115.41 AED/period, more cost-effective than the other binding candidate (H3, 49.56 AED/period for 118 units). A third independent computation path landing on the same hub as T-21's utilization scan and T-22's growth-break search is a good cross-check that these four features are reading a coherent, real underlying network state, not four disconnected demos.

**T-24 · Auto decision-brief**
Contract: agent + template → export. Depends on: T-09, T-20.
Done when: generates a one-page brief (current state, change, cost/risk, what it unblocks, sensitivity); exportable from the UI.
Log:
- WIP — Claude — 2026-08-01
- REVIEW — Claude — 2026-08-01 — `backend/hubris/agents/decision_brief.py::generate_decision_brief()` is pure orchestration — zero new numeric computation, just composes ALREADY-computed JSON from three existing tools (`get_kpis` for current state, `optimise_network` for the proposed change + its T-20 robustness band as `sensitivity`, `find_bottleneck_unlock` for what it unblocks) plus a `summary` paragraph built by plain Python string formatting (no LLM) — so the brief needs no network/API key and can never hang, and every number in `summary` is traceable to a field elsewhere in the same response (test-asserted directly). Hand-checked against two already-proven fixtures: the tiny 2-hub baseline (T-07's known 43.3333 cost-to-serve, nothing to change) and T-09's own `CLOSE_HUB_RAW_TABLES` fixture (recommends closing H2, objective_value=650.0, matching that ticket's own hand math exactly). Wrapped as `generate_decision_brief`, registered, added to the `optimizer` role. New `GET /brief` endpoint. Frontend: a new "Brief" sidebar tab (`DecisionBrief.tsx`) rendering all five required sections, plus an "Export .md" button that builds a Markdown document client-side from the same JSON and triggers a browser download (Blob + `<a download>` — no server round-trip, no browser storage APIs). To test: `docker run --rm -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest backend/tests/ --ignore=backend/tests/test_db.py -v` → 132 passed, 9 skipped; `cd frontend && npx tsc --noEmit` clean. Drove the real stack live (Docker Compose + Playwright, no mocks): the Brief tab renders a complete real brief off the full T-04 dataset in ~0.3s (see the phase-end message for the full rendered output) — recommends closing H1/H3/H5/H7, cost-to-serve 57.0949→50.3035 AED/parcel (-11.89%), "ROBUST UNDER ±20% DEMAND" (35.88–36.44 AED/parcel across 50 trials), and correctly reports no binding bottleneck on the baseline; "Export .md" downloads a matching Markdown file. **This closes Phase 5 (T-21–T-24)**.

### Phase 6 — Stretch (only if core solid)

**T-25 · Demand forecast (Prophet)** — Depends on: T-06 (needs `demand_history`). Done when: twin projects demand forward and the scanner can pre-empt a breach.
Log:

**T-26 · Institutional memory (Qdrant)** — Depends on: T-12. Done when: agents recall past scenarios/decisions semantically.
Log:

**T-27 · SimPy waves** — Depends on: T-08. Done when: the "two delivery waves?" question returns throughput/queue impact.
Log:

### Phase 7 — Event day

**T-28 · Real dataset ingestion + calibration** — Depends on: T-06. Done when: real Excel mapped, loaded, cost model calibrated; open questions in `VISION.md §8c` answered. **(H0–2 on the day.)**
Approved decisions (Sims, 2026-08-05): primary twin = Hub & Spoke (candidates live there); QComm as its own twin for the capacity-crisis view, shown SIDE BY SIDE with H&S; On-Demand report-only; never blend cost pools; cross-network proximity analysis is STRETCH only. Cost: always report BOTH quantities labelled — variable-only (their ≤7.00 target's pool) AND fully-loaded (the 70.4%-overhead pool consolidation attacks). Zone coords via facility zone-name joins; the 2 On-Demand pseudo-zones are flagged unmappable, never faked. T-31 label must flip to "provided" on every surface; T-32 registry re-labelled against real data; speed baselines (8h assessment / 4-8h scenario) measured and logged as scoring lines.
Log:
- WIP — Claude — 2026-08-05
- REVIEW — Claude — 2026-08-05 — commits 84983e5, 5130752, 6d2669c. `ingestion/dataset_g_connector.py`: fingerprints the workbook by its own sheet names (renamed file still auto-picked — proven in test), loads BOTH approved twins from one file. H&S (default) → BASELINE: 13 hubs (3 CAND_ correctly `candidate` for the CFLP), 11 zones, 40 fleet vehicles, 143 OD pairs, **assignments_provided=True from the file's own serving map → `baseline_provenance == "provided"` on real data (T-31 flip, test-asserted)**. QComm → saved scenario `qcomm_twin` in the picker: side-by-side, never blended — cost calibration filters `Cost_to_Serve` by network BEFORE computing anything (pool-purity caught as a real bug on first execution: candidate handling was a median over all 27 mixed rows; now H&S-only, 10.8). Calibration semantics (T-29 finding, documented in code): zones inherit their serving facility's coords, so current-assignment OD distance ≈ 0 — `handling_cost` therefore carries the facility's FULL variable rate ((fuel+labour+vehicle)/shipments, e.g. DXB_01 10.66) and the per-km term prices only INCREMENTAL reassignment distance. Money period-normalised to /day (rent/30; dark stores overhead/30); SLAs: Standard 24h (verified from file README), Express 8h (derived), QComm per-store `target_delivery_min` (data). Zone coords via facility zone-name join; unmappable zone → hard ValueError (flag, never fake) — zero unmappable in either twin (the 2 pseudo-zones are On-Demand-only, report-only by decision). `/ingest` is now registry-driven (`can_handle` scored content+filename, specific-over-generic tie-break); `network=qcomm` param routes to the saved scenario. 7 tests against the REAL file incl. endpoint auto-pick with renamed upload. Run: `docker run --rm -v "$PWD/backend:/app" -w /app hubris-backend-test python -m pytest tests/test_dataset_g.py -q` → 7 passed. Live gate: **LIVE GATE GREEN — 201 passed** (incl. all 9 live no-fabrication tests), 2026-08-05, on commit 6d2669c.

**T-29 · Baseline validation + sensitivity + sanity checks** — Depends on: T-28. Done when: baseline recovers a sane current cost; saving decomposed; conservation/capacity/coverage checks pass; sensitivity holds.
Log:
- REVIEW — Claude — 2026-08-05 — validated against the file's own `Cost_to_Serve`, both pools labelled per decision. **QComm: variable 2.04 vs their 2.04 (max per-store deviation 0.2%) — reproduces**; fully-loaded 3.77 vs 4.03 (volume-definition gap: we amortise fixed over wk-13 demand, they over their stated monthly volumes — DATASET_REPORT §5.3, disclosed not hidden). **QComm flow INFEASIBLE exactly as the report predicted: unmet Abu Dhabi 17/day (Al_Reem 12 + Khalidiyah 5)**, the 15-min SLA correctly walls AUH off from Dubai spare; utilisation avg 94.24%, range 86.8–100% (their §3: 87–102%). **H&S: variable 11.44 vs their 10.91** (max per-hub 16.1% — residual is wk-13 vs monthly volume-mix weights); fully-loaded 43.39 vs 60.11 (same §5.3 gap); feasible, utilisation avg 5.58% range 2.2–12.5% (reproduces their 2–12%). Cost shares: H&S 26% transport / 74% fixed; QComm 54/46. Sanity: MILP on the real twin returns **−45.4%/day by consolidating 8 of 10 active hubs (keeps DXB_03 + AUH_02, opens no candidates), SLA-feasible, 0.18s** — the over-capacity story §3.1 as a computed result, not a narrative. **Speed baselines (scoring lines): opportunity assessment — engine 0.09s, agent-explained 10.5s (verification live: `regenerated`) vs their ~8h; scenario simulation — 0.012s single what-if / 0.18s full MILP vs their 4–8h.** Reproduce: ingest `backend/hubris/data/dataset_g.xlsx` both networks, then `/simulate`, `/threshold/demand-growth?hub_id=HUB_DXB_01`, `/optimize`. Sensitivity/conservation guards are the standing engine tests (201-test gate green). NOT DONE by instruction: stop-and-report before any narrative is built on these numbers.

**T-30 · Demo seed scenario + pitch + Q&A rehearsal** — Depends on: all core. Done when: one always-renders scenario seeded; pitch built; `VISION.md §8b` answers rehearsed out loud.
**Demo-day checklist (Sims, 2026-08-04):** before the pitch, truncate test-generated rows from the demo DB (`DELETE FROM memory_episodes WHERE provenance LIKE 'test%' OR scenario_name LIKE '%_test%'; DELETE FROM memory_heuristics WHERE name LIKE 'api-h-%' OR name LIKE 'check-h5-band-%' AND active=false; DELETE FROM memory_facts WHERE key LIKE 'test.%'`), then re-seed the learning story (the 3-step flow in `examples/learned-heuristic-flow.json`); **never run the test suite after seeding the demo** — the suite writes plausible-looking episodes into the shared db (memory-wiping is fixed, but residue isn't).
Log:
- PARTIAL (seeded scenario only) — Claude — 2026-08-01 — the **"one always-renders scenario seeded"** clause is done; **pitch + Q&A rehearsal remain with Sims (owner L)** and are deliberately untouched. `backend/hubris/data/demo_scenario.py` + `seed_demo_scenario()` in `api/state.py`, called from the FastAPI lifespan: seeds a `demo_surge` scenario at startup so the demo path is a dropdown change, never a live rebuild (BUILD_SPEC §13 "never debug live"). Deliberately a STRESS scenario (Sharjah demand ×5), not the pristine baseline — chosen empirically as the smallest surge where every signature feature has something real to say: on the untouched baseline `find_bottleneck_unlock` honestly reports "nothing binding" and the scanner's far-hub-service finder is empty, which is truthful but shows T-21/T-23 at their least interesting. Under the seed: all 3 inefficiency types fire (9 findings), the bottleneck unlock returns a real verified recommendation (H5, +307 units → 393.41 AED/period saved), and the decision brief gains a populated "What it unblocks" section. Always-renders guarantees, both test-asserted: the seeded flow is **feasible** (no unmet demand → no blank/red view), and `seed_demo_scenario` **returns None instead of raising** on any failure so a broken seed can never stop the app booting. Also resilient to the event-day dataset: the target emirate is only used if it actually exists in the loaded data, else the surge goes network-wide. Supporting work: `AppState.scenario_labels` + `GET /scenarios/saved`, and a header scenario picker in the frontend that switches map, KPIs, Insights and Brief together (`scenario_id` threaded through every panel and the opportunity/bottleneck/threshold/brief API helpers). To test: `docker run --rm --network hubris_default -e DATABASE_URL=... -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest tests/ -q` → **138 passed, 9 skipped** (now includes `test_db.py` against the live compose db); `cd frontend && npm run build` clean. Verified live via Playwright: picker reads `["Baseline","Demo: Sharjah peak surge (5x)"]`, selecting the demo switches every panel, and the brief renders end to end.

### Phase 8 — Integrity & reach (audit remediation + free wins)

> Opened after the `STATUS.md` audit. Phase 8 fixes what the audit proved false and lights
> up what was already built but unreachable. **T-33 is the highest-priority ticket in the
> entire project** — ahead of every Phase 5–7 item.

**T-33 · W1 · Runtime provenance verification ("the AI that cannot lie")** — **EXISTENTIAL, DO FIRST**
Contract: `ProvenanceVerifier.verify(answer, tool_results, question) -> VerificationVerdict` (`CLAUDE.md §4`); gate sits between the agent layer and the API (`ARCHITECTURE.md` module 5b). Depends on: nothing (the checker already exists in `agents/provenance.py`, unused).
Done when: `run_agent_query` calls the verifier on **every** path (workforce, custom agent, goal loop, monitoring, MCP); a flagged answer triggers **one** regeneration pass with the offending figures named back to the agent; the verdict is on `AgentQueryResponse` and rendered as a badge in `AgentChat.tsx`, naming the untraceable figure when flagged; there is **no code path** returning agent prose without a verdict; `runner.py`'s docstring no longer claims something the code doesn't do; and a test asserts a deliberately-fabricating agent is caught rather than passed through.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — **The gate is live.** `core/contracts.py` gains `VerificationVerdict` + `ProvenanceVerifier`; `agents/verifier.py` implements it over the existing (previously test-only) `find_unexplained_numbers`; `agents/runner.py` is rebuilt around `run_verified_query`: every answer is checked against the tool results that run actually received, an untraceable figure triggers exactly ONE regeneration pass with the figures named back to the agent (`REGENERATION_PROMPT`), a second failure returns `status="flagged"` with the figures listed — never silently. The verdict rides `AgentQueryResponse.verification` as a **required** field (a path without a verdict now fails at the schema layer) on all three `/agent/query` paths (workforce / custom agent / single); `workforce.py` propagates it through the graph state; the false docstring the audit flagged is gone. **How a user reaches it:** every `/agent/query` response carries `verification` (visible in /docs and to the frontend); the `AgentChat.tsx` badge render is Nathi's per build rule 6 — backend/API complete, not blocked. Evidence: (1) `tests/test_verifier.py` — 9 scripted-agent tests that run without an LLM and **fail if a fabricated figure escapes as verified** (fabricate-both-passes → flagged naming 29088; fabricate-then-clean → regenerated, correction names the exact figure; clean → verified first pass, no second LLM call; numbers-with-no-tools → flagged; user's-own-number → not fabrication; every result carries a verdict). (2) **Live proof, honestly reported:** first 5x run set was 4 green + 1 failed; diagnosis (runs 6-12 with full logs) reproduced it — NOT a fabrication escape but a pre-existing crash: the LLM passed `optimizer_name="MILP"` (a spelling lifted from the tool's own description), `registry.get` KeyError crashed the whole query via LangGraph's tool node. Fixed under build rule 4: `tool_adapter._call` now returns tool exceptions as correctable error RESULTS (`{"error", "tool", "hint"}`) the agent reads and self-corrects, and the tool description names the exact legal values ('milp_cflp'|'greedy'); regression-pinned in `test_adapter_returns_bad_llm_arguments_as_correctable_error_not_a_crash`. (3) **Official post-fix proof: 5 consecutive full live runs A-E → 157 passed / 0 failed each** (logs kept in session scratchpad). (4) **The gate visibly fires:** 4/4 direct runs of the previously-60%-failing cost_advisor question came back `status=regenerated, attempts=2, untraceable=[]` — the agent fabricated on the first pass every time, was caught every time, and shipped clean every time. (5) Rule-4 hardening found live: when the Anthropic key ran out of credits mid-verification, `/agent/query` returned a raw 500 → added `_run_guarded`: agent-layer failures now degrade to a clean 503 ("Agent layer unavailable: ...") while every deterministic endpoint stays 200 (probed live against the real outage; `test_agent_query_upstream_llm_failure_is_a_clean_503_not_a_crash`). To test (non-live): `docker run --rm --network hubris_default -e DATABASE_URL=postgresql+psycopg2://hubris:hubris@db:5432/hubris -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest tests/ -q` → 150 passed, 9 skipped. Live: same command with `-e ANTHROPIC_API_KEY=...` → 157 passed (ran 5x consecutively). **⚠ The API key exhausted its credits during these runs — T-44's own green run and every later ticket's required live run are blocked until it's topped up.**
- DONE — Sims — 2026-08-04 — "the gate is real and the 4/4 regeneration evidence is exactly what we needed." Key topped up.

**T-34 · Wire the goal-driven loop (tool + route + UI)**
Contract: `AgentTool` wrapper over `run_goal_loop` + `POST /goal` + a UI control. Depends on: T-13 (built), T-33 (its output must be verified).
Done when: `run_goal_loop` is reachable from the agent chat, an API route, and a visible UI control; the returned **path explored** is rendered, not just the final answer; a test drives it through the API.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — commit aa4cc20. `agents/tools/run_goal_loop.py` (registered, optimizer role) + `POST /goal` with TWO ways in per rule 4: `objective` (plain English, LLM-parsed) or `targets` (structured, **fully LLM-free** — the demo path cannot hang on an LLM outage, and non-live tests drive the loop deterministically); LLM/parse failures degrade to a clean 503. Response carries the full **path explored** (one entry per iteration: constraints tried, reduction achieved, changes) — render the path, not just the endpoint. **How a user reaches it:** agent chat (workforce optimizer can call `run_goal_loop`), `POST /goal` (in /docs); the visible UI control is Nathi's (rule 6) and is the one open clause of this Done-when. To test: `test_goal_loop_via_api_structured_targets_no_llm` — 8% target → success at the hand-checked 11.89% in 1 step; 99% target with a 0.2 cap → 3 iterations with the cap strictly relaxing; 400 with neither input; 404 unknown scenario. Verified live: `POST /goal {"targets":{"target_cost_reduction_pct":8.0}}` → success=true, achieved=11.89, path=1. Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 169 passed** (incl. all 9 live no-fabrication tests, none skipped), 2026-08-04, on commit c336faa.
- Re-label vs real data (Sims-requested) — Claude — 2026-08-05 — commit 6d2669c. Ratio now **29 total — 22 assumed / 5 derived / 2 verified** (`GET /assumptions`). What the file flipped: SLA Standard 24h → **verified** (stated in Dataset G README), Express 8h → **derived** (same-day, interpreted window); connector reads both FROM the registry. What it did NOT flip — and why that's honest: the file grounds COSTS and CAPACITIES as *data* (per-facility calibrated handling, real rents, real max_daily_shipments, per-vehicle fuel/km from Fleet_Roster), which live in the model, not the parameter registry; `avg_speed_kmh`, `road_factor`, `dataset_g_days_per_month` (30) remain assumed — the file carries no speeds and no day-count convention. QComm SLAs are per-store data (`target_delivery_min`), deliberately not registry entries.
- DONE — Sims — 2026-08-04 — Wave 1 approved ("the unchanged headline on T-37 and the captured flagged response are exactly what I wanted").

**T-35 · Turn on H3 zoning in `/ingest`**
Contract: `ExcelDataConnector.load(aggregate_zones_to_h3=…)` surfaced as an ingest option. Depends on: T-19 (built).
Done when: `/ingest` accepts an H3 toggle + resolution, the UI upload control exposes it, and an API test proves granular points collapse to hex zones through the real endpoint.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — commit d5cea3b. `POST /ingest?aggregate_zones_to_h3=true&h3_resolution=N` — T-19's built-but-unreachable aggregation now has an endpoint path; default off, clean zone data untouched. To test: `test_ingest_h3_toggle_collapses_granular_points_through_the_endpoint` — 3 granular rows → 2 hex zones (ids `H3-*`) through the real endpoint, and the same workbook without the toggle stays 3 zones. **Reachability caveat for the Done-when's UI clause:** the audit follow-on stands — there is NO upload UI at all (`lib/api.ts` has `ingest()`, no component calls it), so the upload control + H3 toggle are Nathi's; API reachability is complete. Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 169 passed** (incl. all 9 live no-fabrication tests, none skipped), 2026-08-04, on commit c336faa.
- Re-label vs real data (Sims-requested) — Claude — 2026-08-05 — commit 6d2669c. Ratio now **29 total — 22 assumed / 5 derived / 2 verified** (`GET /assumptions`). What the file flipped: SLA Standard 24h → **verified** (stated in Dataset G README), Express 8h → **derived** (same-day, interpreted window); connector reads both FROM the registry. What it did NOT flip — and why that's honest: the file grounds COSTS and CAPACITIES as *data* (per-facility calibrated handling, real rents, real max_daily_shipments, per-vehicle fuel/km from Fleet_Roster), which live in the model, not the parameter registry; `avg_speed_kmh`, `road_factor`, `dataset_g_days_per_month` (30) remain assumed — the file carries no speeds and no day-count convention. QComm SLAs are per-store data (`target_delivery_min`), deliberately not registry entries.
- DONE — Sims — 2026-08-04 — Wave 1 approved ("the unchanged headline on T-37 and the captured flagged response are exactly what I wanted").

**T-36 · Expose all 6 scenarios in ScenarioPanel**
Contract: the panel builds its controls from `GET /scenarios`' `params_schema`, not a hard-coded union type. Depends on: T-10, T-17.
Done when: `move_hub`, `add_hub` and `add_customer` are usable from the UI alongside the existing three; adding a 7th scenario module requires **no frontend change**.
Log:

**T-37 · Fix the >100% utilisation artifact**
Contract: distinguish assignment-based from flow-based utilisation (`ARCHITECTURE.md §3`, the "five concepts" discipline). Depends on: T-07, T-08.
- WIP — Claude — 2026-08-04 (log entry moved below Done-when by convention; see REVIEW)
Done when: no view can report a hub above 100% while the flow is feasible; the two quantities are separately named in the API; the seeded demo scenario shows the corrected figure; **T-07's hand-checked fixtures are re-derived (not just re-run) and the ticket log states the before/after impact on the headline cost-to-serve / ~5% number explicitly** — per Sims (2026-08-04), this must not be fixed quietly: if the headline moves, the log says by how much and why; if it doesn't, the log says that.
Log:
- REVIEW — Claude — 2026-08-04 — commit 4d3fb92. `UtilizationMetric` + `SpareCapacityMetric` now compute from the FLOW SOLVE's volumes (shared `flow_volume_by_hub` so the two can never diverge onto different definitions); flow respects capacity by construction → **no view can exceed 100% while feasible**. The old quantity survives under its honest name: `HubMapInfo.assignment_share_pct` (dominant-hub attribution, CAN exceed 100 on split zones, documented as attribution-not-utilisation). **Headline impact, stated explicitly: cost-to-serve 57.0949 → 57.0949 — UNCHANGED; the 11.89% optimiser claim — UNCHANGED** (cost_to_serve deliberately stays on the documented T-02 dominant-assignment approximation; only utilisation/spare moved to flow). Re-derived, not just re-run: tiny fixture identical (flow == dominant assignment there: 30.0 avg, H1 50/H2 10, spare 50/90); synthetic baseline avg identical 15.89 with per-hub shifts only H3 21.57→20.96 and H4 11.01→11.41 (the flow's genuinely cheaper split, consistent with T-08's 132,567-vs-132,577 log); `test_opportunities`' full-scan fixture re-derived under flow-truth (new nearby-idle H4; idle finding asserted as exactly [H1→H4]). Verified live on the demo scenario: **H5 `utilization_pct: 100.0` alongside `assignment_share_pct: 107.67`** — the artifact is now a labelled distinction, not a wrong number. Spare capacity is flow-based too (can no longer go negative). Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 169 passed** (incl. all 9 live no-fabrication tests, none skipped), 2026-08-04, on commit c336faa.
- Re-label vs real data (Sims-requested) — Claude — 2026-08-05 — commit 6d2669c. Ratio now **29 total — 22 assumed / 5 derived / 2 verified** (`GET /assumptions`). What the file flipped: SLA Standard 24h → **verified** (stated in Dataset G README), Express 8h → **derived** (same-day, interpreted window); connector reads both FROM the registry. What it did NOT flip — and why that's honest: the file grounds COSTS and CAPACITIES as *data* (per-facility calibrated handling, real rents, real max_daily_shipments, per-vehicle fuel/km from Fleet_Roster), which live in the model, not the parameter registry; `avg_speed_kmh`, `road_factor`, `dataset_g_days_per_month` (30) remain assumed — the file carries no speeds and no day-count convention. QComm SLAs are per-store data (`target_delivery_min`), deliberately not registry entries.
- DONE — Sims — 2026-08-04 — Wave 1 approved ("the unchanged headline on T-37 and the captured flagged response are exactly what I wanted").

**T-31 · Reconstructed-baseline labelling**
Contract: baseline provenance surfaced through API → UI → brief. Depends on: T-08, T-24.
Done when: whenever the baseline is our nearest-hub proxy rather than a real `current_assignments` table, every surface reporting an improvement says so and states it is **not** a description of EMX's current practice; the decision brief carries the label; a test asserts the flag flips when real assignments are ingested.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — commit 8d3d761. `RawTables.assignments_provided` (set by the connector iff a current-assignments sheet actually existed) → `NetworkModel.baseline_provenance` ("provided" | "reconstructed_nearest_hub") → surfaced on `GET /network`, `/kpis`' network_summary (so **agents** cite it too — the get_kpis description instructs saying so when quoting baseline figures), and the decision brief, whose summary appends the re-validation caveat sentence when reconstructed. **How a user reaches it:** all three surfaces live now; UI display is Nathi's. To test: `test_baseline_provenance_is_labelled_end_to_end` (synthetic → reconstructed on all three surfaces, caveat present) and `test_baseline_provenance_flips_to_provided_when_assignments_are_ingested` (workbook WITH an assignments sheet → "provided", **caveat disappears** — no scary label where none is due). Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 169 passed** (incl. all 9 live no-fabrication tests, none skipped), 2026-08-04, on commit c336faa.
- Re-label vs real data (Sims-requested) — Claude — 2026-08-05 — commit 6d2669c. Ratio now **29 total — 22 assumed / 5 derived / 2 verified** (`GET /assumptions`). What the file flipped: SLA Standard 24h → **verified** (stated in Dataset G README), Express 8h → **derived** (same-day, interpreted window); connector reads both FROM the registry. What it did NOT flip — and why that's honest: the file grounds COSTS and CAPACITIES as *data* (per-facility calibrated handling, real rents, real max_daily_shipments, per-vehicle fuel/km from Fleet_Roster), which live in the model, not the parameter registry; `avg_speed_kmh`, `road_factor`, `dataset_g_days_per_month` (30) remain assumed — the file carries no speeds and no day-count convention. QComm SLAs are per-store data (`target_delivery_min`), deliberately not registry entries.
- DONE — Sims — 2026-08-04 — Wave 1 approved ("the unchanged headline on T-37 and the captured flagged response are exactly what I wanted").

**T-32 · Evidence-labelling of engine inputs**
Contract: one assumption registry; every parameter tagged `verified` / `derived` / `assumed` with a source where one exists. Depends on: none (do before T-28).
Done when: `ROAD_FACTOR`, `AVG_SPEED_KMH`, scanner thresholds, Monte Carlo defaults, demo-surge factor and all synthetic cost parameters live in one labelled registry; `GET /assumptions` exposes it; the UI can show "this number rests on N assumed inputs"; nothing numeric is defined outside it.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — commit 50e8774. `core/assumptions.py`: 23 parameters, each `verified`/`derived`/`assumed` with a source sentence and consumer list; 13 modules refactored to IMPORT their constants from it (geo, routing, flow, milp, monte_carlo, opportunities ×7, threshold_finder ×4, h3_zoning, cost_model, demo_scenario, excel_connector, synthetic, 3 scenario modules) — `test_module_constants_are_registry_values_not_copies` breaks if anyone re-hardcodes one, so the registry is load-bearing, not a parallel catalogue. `GET /assumptions` live: **total 23 — 18 assumed / 4 derived / 1 verified** (the honest ratio IS the feature: it's the T-28 replace-list). `test_verified_entries_cite_a_document` keeps "verified" honest. Scope note: synthetic DATASET rows (hub capacities, demand draws) are data, not engine parameters — they stay in the generator; every cross-cutting engine input named by the Done-when is in. UI surface = Nathi. Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 169 passed** (incl. all 9 live no-fabrication tests, none skipped), 2026-08-04, on commit c336faa.
- Re-label vs real data (Sims-requested) — Claude — 2026-08-05 — commit 6d2669c. Ratio now **29 total — 22 assumed / 5 derived / 2 verified** (`GET /assumptions`). What the file flipped: SLA Standard 24h → **verified** (stated in Dataset G README), Express 8h → **derived** (same-day, interpreted window); connector reads both FROM the registry. What it did NOT flip — and why that's honest: the file grounds COSTS and CAPACITIES as *data* (per-facility calibrated handling, real rents, real max_daily_shipments, per-vehicle fuel/km from Fleet_Roster), which live in the model, not the parameter registry; `avg_speed_kmh`, `road_factor`, `dataset_g_days_per_month` (30) remain assumed — the file carries no speeds and no day-count convention. QComm SLAs are per-store data (`target_delivery_min`), deliberately not registry entries.
- DONE — Sims — 2026-08-04 — Wave 1 approved ("the unchanged headline on T-37 and the captured flagged response are exactly what I wanted").

**Wave-1 additions (Sims, 2026-08-04)**
- **A · cost_advisor double-call root cause** — commit c336faa. The live-captured fabrication was `savings_per_parcel × total_demand` ("~29,088 AED annually") — no TOTAL saving existed in `optimise_network`'s JSON, so the agent computed one. Now returned computed: `total_cost_before/after/savings` (hand-checked on the tiny fixture: 2600/2600/0), with the description explicitly forbidding the multiplication and the per-period→annual relabel. **Measured on the same adversarial question: pass-1 clean 4/6 (was 0/4 before the fix), remaining 2/6 caught and regenerated cleanly, 0 flagged** — latency halved on two-thirds of these queries with the gate still covering the tail.
- **B · live flagged terminal state, captured for Nathi** — `examples/flagged-verification-response.json`: a real `/agent/query` response with `verification = {status: "flagged", untraceable_figures: [123456.78], attempts: 2, checked_against: ["get_kpis"]}`, produced by a deliberately adversarial temp agent ordered to keep an invented figure under correction (deleted after capture). Confirms the designed contract: HTTP 200, the prose IS returned, the verdict names the exact figure — the UI must mark it, never render it as trustworthy. The `verification` API contract needed **no change** — frozen as Nathi is building it.

### Phase 9 — The learning twin & platform reach

**T-38 · W2a · Memory core — schema, `MemoryStore`, episodic tier**
Contract: `MemoryStore` (`CLAUDE.md §4`) over the `memory_*` tables (`SCHEMA.md §1a`). Depends on: T-05 (schema exists), T-33.
Done when: Alembic migration creates all four `memory_*` tables; **every** `/simulate` and `/optimize` run writes an episode with provenance; `GET /memory/episodes` returns them; the Postgres layer is no longer dead at runtime; a test proves an episode survives a process restart.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — **Postgres is load-bearing.** `core/contracts.py` gains `MemoryRecord` + `MemoryStore` (provenance mandatory at the contract boundary — a record without it is a ValueError, deliberately NOT swallowed); `core/orm.py` + migration `a7c2e91b3f04` create all four `memory_*` tables (auto-applied at boot; the compose backend image is rebuilt since `migrations/` is baked at build time, found the hard way when `alembic upgrade head` inside the running container was a silent no-op). `memory/store.py::PostgresMemoryStore` — graceful by construction: every method catches DB failures and returns None/False/[]; infrastructure failure degrades, programming errors (bad kind, missing provenance, non-machine-applicable rule) still raise. **Every run becomes an episode**: `/simulate` + `/optimize` routers AND the agent tool path (`tool_adapter` chokepoint, so agent-chosen what-ifs enter history too), each stamped `source:runid` provenance. **How a user sees it (Sims' note 1):** `GET /memory/episodes` (live now: `available: true`, real episodes with the exact KPIs the API returned) — with the explicit caveat that T-38 alone is API-surface only; the "twin has learned something" user-visible proof (recall in chat, heuristics applied) is T-39's deliverable, per the ticket split. **Demo safety (note 2), test-proven:** with the store's engine pointed at an unreachable host, `/simulate` still 200 with correct KPIs and `/memory/episodes` returns `{available: false, episodes: []}` — never an error (`test_demo_path_survives_memory_being_down`). **Restart survival:** a second store over a brand-new engine reads what the first wrote (`test_episode_survives_a_process_restart`). To test: 9 new tests in `test_memory_store.py` + 2 API tests; full non-live suite 169 passed. Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 178 passed** (incl. all 9 live no-fabrication tests), 2026-08-04.
- DONE — Sims — 2026-08-04 — Wave 2 approved.

**T-39 · W2b · Semantic + procedural memory, agent-writable heuristics**
Contract: `record_fact` / `record_heuristic` / `recall` + a `record_heuristic` **agent tool**. Depends on: T-38.
Done when: facts upsert on re-observation and raise `confidence`; an agent can record a heuristic that is stored with author + provenance and **applied** in a later session (demonstrated end-to-end, not just stored); a planner can retire a heuristic via `active=false`; provenance is mandatory at the contract boundary — a fact without it is rejected.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — **The twin visibly learns.** Semantic tier: facts upsert on re-observation with a transparent confidence formula (0.5 + 0.1/observation, capped 0.95 — stated, recomputable, not a learned score); the threshold finder **auto-records its measured break points as facts** (`hub.H5.demand_growth_break = 2.7266x`, engine provenance) — numeric memory is ENGINE-written only. Procedural tier: `record_heuristic` agent tool (auto-stamped provenance, author recorded) with the **number-free guard**: advice/rationale containing material figures is rejected with an instructive error — this is what keeps memory from becoming a fabrication loophole (an agent cannot launder an invented figure into future runs' evidence). Application is **annotation-only** (`memory/apply.py`, at all three chokepoints: agent adapter + /optimize + /simulate): a matching active heuristic is APPENDED to the tool result (`applied_heuristics`) — memory directs attention and explanation, never arithmetic; `test_annotation_never_touches_error_results_or_computation` proves every computed key byte-identical. Planner retire switch: `POST /memory/heuristics/{name}/active` — switched off, kept, auditable (`times_applied` counts real influence). `recall_memory` agent tool on all five roles (recalled numbers are legitimate T-33 evidence: each was engine-computed with the provenance it carries). **How a user sees it (Sims note 1) — the concrete example (note 3), captured live through the real chat API** (`examples/learned-heuristic-flow.json`): (1) LEARN — asked when H5 breaks + to remember the lesson: risk_analyst measured 2.7266x (fact auto-recorded), then recorded heuristic `scrutinise_hottest_hub_robustness_before_closure`; in the first capture its initial attempt smuggled `172.66` into the advice and **the guard rejected it live** with the rephrase-and-retry error — it retried number-free and succeeded; (2) APPLY — a later plain `POST /optimize` response carries the heuristic in `applied_heuristics`, author and provenance attached; (3) RECALL — "what do we know about H5?" → cites 172.66% / 2.73x from memory with its run id, `verification: verified`. **Two real defects found live and fixed:** (a) citing a provenance run id verbatim (`...c762`) false-positive-flagged the verifier — identifier tokens mixing letters+digits are now stripped before number extraction (regression-tested; verdict contract shape unchanged); (b) `test_db`'s metadata-wide DELETE sweep **erased all four memory tables on every full suite run** — including the live gate — silently wiping the twin's memory on the shared compose db; scoped to the canonical tables it actually tests, and the memory tests now clean their own residue. **Demo safety (note 2):** all reads return `available:false` + empty — never an error — when the DB is down; recording is best-effort; annotation skips on any failure; with memory empty, every response is byte-identical to pre-memory behaviour. To test: `test_memory_learning.py` (7 tests: upsert/confidence, auto-facts, numeric-advice rejection, full learn→apply→retire loop, degraded recall, annotation-only proof) + API test for facts/heuristics/retire; non-live suite 178 passed. Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 187 passed** (incl. all 9 live no-fabrication tests), 2026-08-04.
- DONE — Sims — 2026-08-04 — Wave 2 approved ("the guard rejecting 172.66 on camera is better evidence than the feature itself").

**T-40 · W4 · Closed-loop autonomous monitoring**
Contract: scheduler runs `monitoring`-autonomy agents; alerts land in `memory_alerts`. Depends on: T-38, T-14, T-33.
Done when: `capacity_watchdog` self-runs on a schedule with no user action, **runs a real simulation** (not a cached-KPI threshold check), writes an alert with computed finding + recommended action + brief link, and the UI shows an alert card that can be acknowledged; a test proves the scheduled path produces an alert from a synthetic breach.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — **`monitoring` autonomy is real.** `monitoring/watchdog.py`: each sweep runs a REAL stress simulation of the baseline (`demand_scale × watchdog_stress_factor` re-solved through the flow LP via `apply_and_reassign` — not a cached-KPI check) and evaluates every saved scenario as-is; infeasible → `critical` (with per-zone unmet demand listed), hottest flow-based hub ≥ `watchdog_hot_utilization_pct` → `warning`. The recommended action is COMPUTED: T-23's bottleneck unlock re-solved on the very model that alarmed (else a robustness-band pointer); brief link resolves to the real `/brief`; provenance names the sweep. **Deliberately deterministic — no LLM in the background loop** (a monitoring narrative composed by an LLM every N seconds is a demo-fragility machine; the sweep runs under the seeded `capacity_watchdog` identity, and LLM prose stays out by design — logged as a scope decision, not an accident). `monitoring/scheduler.py`: lifespan-started asyncio loop, **boot sweep first** (the "pre-seeded alert" is real engine output against the real seeded scenario, not a planted row), then every `monitoring_interval_seconds` (assumption-labelled, with `watchdog_stress_factor` + threshold); every sweep fully caught — `last_error` in status, loop never dies, nothing raises into the request path; pausable (`POST /monitoring/enabled`); manual `POST /monitoring/run-once` with optional stress override (demo crank + tests). Dedup: one unacknowledged card per target — a 5-min cadence can't stack identical alerts. **How a user reaches it:** `GET /monitoring/status`, `GET /memory/alerts`, `POST /memory/alerts/{id}/ack`, run-once — all live; the alert CARD ui is Nathi's (contract = the captured JSON). **Captured alert (Sims' ask), `examples/captured-alert.json`:** backend restarted → `runs: 1` before any request → warning on `demo_surge`: H5 at 100.0% vs 90% threshold, action `add_capacity` +307 units → **393.41 AED/period verified savings**, `brief_link: /brief?scenario_id=demo_surge`, `provenance: watchdog:sweep:0fc8edcc4242`; baseline+1.2x checked and healthy (correctly quiet). **Graceful (memory down, test-proven):** sweep computes, reports `alerts_dropped_memory_unavailable`, creates nothing, raises nothing. To test: `test_monitoring.py` (healthy-quiet, hot→computed alert incl. verified-savings action + dedup, ×50 stress → critical with real unmet list, memory-down drop) + API test (status/run-once/ack/404/pause); non-live suite 183 passed. Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 192 passed** (incl. all 9 live no-fabrication tests), 2026-08-04.

**~~T-41 · W5 · Multi-agent swarm with adversarial review~~ — CUT**
Log:
- CUT — Sims — 2026-08-04 — Do not build. The measured 60% single-agent misbehaviour rate (STATUS.md) makes a live multi-agent chain too fragile for the demo path, and Monte Carlo robustness bands already challenge the Optimizer's recommendation with real computed numbers. The adversarial-review *narrative* is delivered by the existing Risk role + T-20 bands; the swarm *machinery* is not worth the demo risk. Do not resurrect without a new decision from Sims.

**T-42 · W3 · Time Machine (temporal navigation)**
Contract: `GET /timeline` over episodic memory + **scenario projections** (see naming rule below); scrubber drives the map. Depends on: T-16 (map) for the scaffold; **T-38 (episodic memory) for the backward direction only**.
Build order (per Sims, 2026-08-04): **scaffold against mock data starting in Wave 1**, not Wave 3 — timeline state, scrub interaction, map re-render, and flow enter/exit transitions can all be built and tested against fixture data before memory exists, then swapped to real episodes when T-38 lands.
**Backward scrubbing depends on T-38 and must degrade gracefully without it:** if no episodes exist (fresh boot, memory unavailable, pre-T-38), the backward direction shows an explicit empty state ("no recorded history yet") — never an error, never a blank map, never synthetic history.
**Naming rule (per Sims): the forward direction is "scenario projections", NOT "forecast" — everywhere it appears**: UI labels, API field names, agent explanations, and briefs. We have no demand forecast (T-25 is TODO). Overclaiming forecast is the exact failure class the audit caught; a `forecast_*` identifier anywhere in this feature is a review-blocking defect.
Done when: a scrubber under the map moves through recorded past decisions and scenario projections; the map re-renders live as it moves; **dropped flows grey out and new flows highlight**; the backward view degrades gracefully with zero episodes; nothing in UI/API/prose calls the forward direction a forecast; every state shown came from a stored episode or a real projection — never an interpolation invented in the browser.
Log:

**T-43 · W6 · Hubris as an MCP server**
Contract: MCP surface generated from `registry.as_agent_tools()`. Depends on: T-03, T-33.
Done when: an external MCP client can list and call the twin's tools and get identical JSON to the internal path; registering a new plugin publishes it to MCP with **no** per-tool wiring; agent-facing responses route through the T-33 gate; documented well enough that a judge can point their own client at it.
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — **The twin is operable from outside.** `hubris/mcp_server/` (stdio entrypoint `python -m hubris.mcp_server`, `mcp==1.12.4` — pinned as the newest release compatible with the existing `pydantic==2.10.4` pin after 1.29 failed resolution; recorded, not hidden). The tool surface is GENERATED from `registry.all(AGENT_TOOL)` at list time — the server module contains no tool names, and `test_new_plugins_need_no_mcp_wiring` statically asserts that, so registering a plugin publishes it with zero wiring. Guarantees crossing the boundary: results are the engine's computed JSON **byte-identical to the internal path** (test-asserted: MCP `get_kpis` == internal `GetKpisTool.run` == 57.0949, network_summary equal); T-38 episodes record for external callers (`source: mcp:*`) and T-39 heuristic annotations apply; bad args and bad `_scenario_id` come back as correctable `{"error"}` payloads, never protocol crashes (same graceful contract as the adapter, incl. the live-observed `optimizer_name="MILP"` case re-proven over the wire). **T-33 note, stated in code + here:** MCP exposes TOOLS returning engine JSON — no LLM prose is produced on our side, so there is nothing for the provenance gate to verify; the external caller is the orchestrator and its prose is outside our boundary, while every NUMBER it gets from us is engine-computed. **Honest limitation, documented:** the MCP process is its own twin instance (baseline + seeded `demo_surge` via `_scenario_id`); HTTP-API-saved scenarios aren't visible cross-process — durable cross-process state is what the Postgres memory tiers are for. **The working external call (Sims' ask), `examples/mcp-external-call.json`:** a real `mcp` ClientSession spawned the server as a separate process, handshook (protocol 2025-06-18), listed all 13 tools, then ran baseline KPIs (57.0949, `reconstructed_nearest_hub` label intact), a demand ×1.3 what-if (**-10.57% cost-to-serve, feasible — computed by the real engine over the wire**), and the demo scenario (H5 100.0%). README documents a copy-paste Claude Desktop config. To test: `test_mcp_server.py` (full client round-trip + schema checks + graceful contract + the no-wiring static proof); non-live suite 185 passed. Live gate: `./scripts/test-live.sh` → **LIVE GATE GREEN — 194 passed** (incl. all 9 live no-fabrication tests), 2026-08-04.

**T-44 · Live-agent CI path (guardrail regression)**
Contract: a test path that runs the 9 live-LLM tests with a real `ANTHROPIC_API_KEY`, immediately after T-33 lands. Depends on: T-33.
Done when: a documented, one-command way to run the full suite *including* the live agent tests exists (compose-based or CI secret); the live no-fabrication tests are **required, not skippable, for every ticket after T-33** — a ticket's REVIEW log must show a green live-agent run, and the leader's checklist enforces it; flake handling is defined (a fabrication failure is a real failure, never retried into green).
Log:
- WIP — Claude — 2026-08-04
- REVIEW — Claude — 2026-08-04 — `scripts/test-live.sh`: the one-command live gate. Env-var key wins, `.env` fallback; **fail-fast preflight** (a 1-token API ping) turns a dead/unfunded key into a clear ~2-second exit-3 with the API's own error text instead of 9 confusing test errors; compose-network precondition check (exit 5); runs the full suite with the key and DB; **fails (exit 4) if the live tests were SKIPPED rather than run** — a green that silently skipped the guardrail is impossible; **no retry logic exists in the script by design** (build rule 5 — a red run is a red run). README documents it; the Leader's follow-up loop now requires a green run in every REVIEW log from this ticket onward. Same command works in CI with the key as a secret. **How a user reaches it:** `./scripts/test-live.sh` from the repo root. Verified: exit-2 (no key anywhere) and exit-3 (key present but out of credits — probed against the real current outage) both demonstrated live; the wrapped pytest command is byte-identical to the one that ran green 5x consecutively for T-33 (runs A–E, 157 passed each). **⚠ The script's own end-to-end GREEN run is blocked: the API key exhausted its credits during T-33's proof runs. Top up, then `./scripts/test-live.sh` must print "LIVE GATE GREEN" before any Wave-1 ticket enters REVIEW.**
- DONE — Sims — 2026-08-04 — key topped up; the first green `./scripts/test-live.sh` run is recorded in the next ticket's REVIEW note.

---

## BUILD PLAN

> Ordering, parallelism, and an honest read on what lands. Owners: **Simeon** (engine/core
> + integrity), **Omair** (agents/memory), **Nathi** (frontend). Reassign freely — the
> dependencies matter more than the names.

> **Approved by Sims 2026-08-04 with adjustments:** T-41 CUT (do not build); T-42 scaffolds
> from Wave 1 against mock data; forward direction is named "scenario projections"
> everywhere; T-37 must log its headline impact; T-44 (live-agent CI) lands immediately
> after T-33 and its tests are required for every subsequent ticket.
> **Priority if time runs short: T-33 > Wave 1 > Time Machine + memory > monitoring + MCP.**

### Execution order

**Wave 0 — stop the bleeding (blocks everything).**
`T-33` alone, immediately followed by **`T-44`** (live-agent CI). Nobody starts anything
else until the provenance gate is live, because every feature after it produces agent prose
that must pass through it, and retrofitting a gate is strictly harder than building on top
of one. T-44 rides the same wave: from that point on, the 9 live no-fabrication tests are
**required for every ticket's REVIEW**, not skippable — a green run with the key is part of
the definition of done.

**Wave 1 — free wins + Time Machine scaffold, fully parallel.** Only `T-34` waits on `T-33`.

| Ticket | Owner | Why it's here |
|---|---|---|
| `T-34` goal loop wiring | Omair | Implementation + tests exist; needs a tool, a route, a button |
| `T-35` H3 in `/ingest` | Simeon | One parameter through one endpoint |
| `T-36` all 6 scenarios | Nathi | Panel becomes schema-driven; removes future work |
| `T-37` >100% utilisation | Simeon | Small, but touches a hand-checked metric — headline impact logged, never quiet |
| `T-32` assumption registry | Simeon | Pure refactor; **do before T-28**, it gets harder once real data lands |
| `T-31` baseline labelling | Omair | Mostly plumbing a flag to three surfaces |
| `T-42a` **Time Machine scaffold (mock data)** | Nathi | Per Sims: starts NOW, not Wave 3 — scrubber, map re-render, flow grey/highlight transitions, all against fixtures; backward view built empty-state-first so it degrades gracefully until T-38 exists |

**Wave 2 — the learning twin.** `T-38` → `T-39`. Strictly sequential; `T-38` is the
foundation (schema + store + episodic writes) and is the ticket that finally makes Postgres
load-bearing. `T-39` is where the *demo* lives — an agent writing a heuristic that changes a
later answer is the moment "learning twin" stops being a slide. Simeon starts `T-43` (MCP)
here in parallel; Nathi continues `T-42a` polish.

**Wave 3 — light-up, once memory exists.**
- `T-42b` Time Machine backward direction goes live on real episodes (Nathi) — the scaffold
  already handles the empty state, so this is a data swap, not a build.
- `T-40` monitoring (Omair) — needs `T-38` for alert storage.
- `T-43` MCP finish (Simeon).

**T-41 is CUT (Sims, 2026-08-04). There is no Wave 4.** The adversarial-review narrative is
carried by the existing Risk role + T-20 Monte Carlo bands, which already challenge the
Optimizer with real computed numbers.

### Dependency graph (critical path in bold)

```
  **T-33** ──┬── T-44 (CI — gates every later REVIEW)
             ├── T-34 ──────────────────────────────────┐
             ├── T-43 (MCP)                             │
             └── **T-38** ── **T-39** ──┬── T-40        ├── demo
                                        └── T-42b       │
  T-42a scaffold (mock; Wave 1) ───────────┘            │
  T-32, T-31, T-35, T-36, T-37  (independent) ──────────┘
```

Critical path: **T-33 → T-38 → T-39**. Everything else can be cut without breaking the
narrative. Protect that chain first.

### Parallelism by person

| Wave | Simeon | Omair | Nathi |
|---|---|---|---|
| 0 | **T-33 → T-44** | (review T-33) | verification badge UI |
| 1 | T-35, T-37, T-32 | T-34, T-31 | T-36, **T-42a scaffold (mock)** |
| 2 | T-43 (MCP) | **T-38 → T-39** | T-42a polish (transitions, empty states) |
| 3 | T-43 finish, hardening | T-40 | **T-42b** live on real episodes |

Nathi's constraint is resolved by the Wave-1 start: the Time Machine's hard parts (scrub
interaction, re-render, transitions) are built against fixtures long before memory exists,
so Wave 3 is a data swap.

### Honest estimate

**Will land (high confidence):** T-33, T-44, T-34, T-35, T-36, T-37, T-31, T-32. Small,
mostly wiring, mostly against code that already exists and is tested.

**Should land (medium):** T-38, T-39, T-43, T-42a (scaffold). Real builds, but well-bounded
— and the scaffold's early start removes the Time Machine's scheduling risk.

**At risk (genuinely uncertain):** T-42b on real episodes (inherits any T-38 slip), T-40
monitoring (scheduler fragility — see risk flags).

**Cut by decision, not by time:** T-41.

### Priority when time runs short (Sims, 2026-08-04)

**T-33 > Wave 1 (incl. T-42a scaffold) > Time Machine + memory (T-38/T-39/T-42b) >
monitoring + MCP (T-40/T-43).** Cut from the right end of that chain, never the left.

---

## RISK FLAGS — read before committing to this scope

**1. This plan is still more than the remaining time comfortably supports.**
Twelve tickets (after cutting T-41, adding T-44), three people. The priority chain is now
fixed by Sims: **T-33 > Wave 1 > Time Machine + memory > monitoring + MCP** — cut from the
right end, never the left. The remaining discretionary call is only *where on the right*
the line falls.

**2. ~~T-41 adversarial swarm~~ — RESOLVED: CUT (Sims, 2026-08-04). Do not build.**
Rationale on record: the measured 60% single-agent misbehaviour rate makes a live
multi-agent chain too fragile for the demo path, and Monte Carlo bands already challenge
the Optimizer with real numbers. The Risk-vs-Optimizer *story* stays in the pitch; the
swarm machinery does not exist and must not be resurrected without a new decision.

**3. T-42 (Time Machine) — RESOLVED: scaffold starts in Wave 1 (Sims, 2026-08-04).**
The hard interaction engineering (scrubber, re-render, flow grey/highlight transitions) is
built against mock data from Wave 1; backward scrubbing depends on T-38 and is built
empty-state-first so it degrades gracefully when episodes are absent. Residual risk is
only T-42b (the real-episode swap) inheriting a T-38 slip. The quality bar stands: if the
scrubber stutters, cut it — a janky timeline reads worse than none.

**4. Forward direction naming — RESOLVED: "scenario projections", never "forecast" (Sims, 2026-08-04).**
Applies everywhere the feature surfaces: UI labels, API field names, agent explanations,
briefs, and the pitch. We have no demand forecast (T-25 TODO). A `forecast_*` identifier in
Time Machine code is a review-blocking defect, not a style nit.

**5. T-40's scheduler is a demo-fragility risk.**
A background job that self-runs during a live demo is a background job that can throw during
a live demo. Requirements: it must never raise into the request path, must be pausable from
the UI, and there must be a pre-seeded alert so the card is populated even if the scheduler
is switched off for the pitch.

**6. T-37 — RESOLVED into the ticket's Done-when (Sims, 2026-08-04).**
Fixtures are *re-derived*, not just re-run, and the ticket log must state the before/after
impact on the headline cost-to-serve / ~5% figure explicitly — including "no change" if
that is the result. A quiet fix fails review.

**7. Free wins are free *now* and expensive after T-28.**
T-32 (assumption registry) and T-35 (H3) get materially harder once the real dataset lands
and everything is in flux. They are in Wave 1; if they slip out of it, accept they won't
happen.

**8. ~~Live-agent CI~~ — RESOLVED: promoted to T-44, immediately after T-33 (Sims, 2026-08-04).**
The 9 live no-fabrication tests become **required for every subsequent ticket's REVIEW** —
a green live-agent run with the key is part of the definition of done from T-44 onward. A
fabrication failure is a real failure; it is never retried into green.

---

## Leader's follow-up loop (Sims)

- Scan the **Index** — anything in `REVIEW` is waiting on you; anything `BLOCKED` needs unblocking now.
- To review: pull the branch, confirm it registers, run its fixture test, check it against "Done when." Then set `DONE` or bounce it back to `WIP` with a log note.
- **Live gate (from T-44 on):** a ticket's REVIEW log must include a green `./scripts/test-live.sh` run (the 9 live no-fabrication tests RUN, not skipped). A red run is recorded as red — never re-rolled into green. No green live run → not `DONE`.
- Protect the build order: don't let Phase 5/6 tickets go `WIP` while Phase 0–1 has open tickets.
- The one check that overrides everything: does any agent output a number that didn't come from a tool? If yes, that ticket is not `DONE`, no matter how good it looks.
