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
| T-01 | Repo scaffold + Docker Compose | 0 Scaffold | A | REVIEW |
| T-02 | Core: NetworkModel + contracts.py | 0 Scaffold | A | REVIEW |
| T-03 | Core: plugin registry + agent auto-discovery | 0 Scaffold | A | REVIEW |
| T-04 | Synthetic EMX dataset fixtures | 0 Scaffold | A | REVIEW |
| T-05 | Canonical schema + Postgres migrations | 0 Scaffold | A | TODO |
| T-06 | Ingestion + schema mapper (DataConnector) | 1 Engine | A | TODO |
| T-07 | Cost/KPI calculator (Metric plugins) | 1 Engine | A | TODO |
| T-08 | Min-cost flow assignment + duals | 1 Engine | A | TODO |
| T-09 | MILP recommender + greedy fallback | 1 Engine | A | TODO |
| T-10 | Scenario modules (move/close/add hub, fleet, demand) | 1 Engine | A | TODO |
| T-11 | LangGraph agent tools wrapping the engine | 2 Agents | B | TODO |
| T-12 | Multi-agent workforce graph | 2 Agents | B | TODO |
| T-13 | Goal-driven optimisation loop | 2 Agents | B | TODO |
| T-14 | Agent Builder (custom agents + templates) | 2 Agents | B | TODO |
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

**T-02 · Core: NetworkModel + contracts.py**
Contract: defines all of them (`DataConnector`, `Metric`, `ScenarioModule`, `OptimizerStrategy`, `AgentTool`) + `NetworkModel`, `MetricResult`, `Recommendation`. Depends on: T-01.
Done when: the abstract interfaces from `CLAUDE.md §4` exist and import cleanly; `NetworkModel` hydrates from fixtures.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/core/models.py`: `Hub`, `Zone`, `FleetType`, `OD`, `RawTables` per `SCHEMA.md §1`. `backend/hubris/core/contracts.py`: the 5 ABCs + `NetworkModel`/`MetricResult`/`Recommendation` verbatim from `CLAUDE.md §4`, plus `NetworkModel.from_raw_tables()` to hydrate. Per the confirmed decision, `assignments` stays single dominant-hub-per-zone (`dict[str,str]`) even though `current_assignments` rows can split a zone across hubs — the dominant hub (largest volume) wins; full split volumes are preserved in the raw/DB layer, not in this field. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/test_contracts.py -v"` → 3 passed (contracts import cleanly; tiny 2-hub/3-zone fixture hydrates correctly, including dominant-hub resolution for a deliberately-split zone; MetricResult/Recommendation shapes valid).

**T-03 · Core: plugin registry + agent auto-discovery**
Contract: `Registry` (`CLAUDE.md §5`). Depends on: T-02.
Done when: plugins self-register at startup; `registry.as_agent_tools()` returns tools for all registered metrics/scenarios/optimisers; adding a plugin needs no agent change (prove with one dummy plugin).
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/core/registry.py`: `Registry` (`register/get/all/as_agent_tools`) + decorators (`register_metric/scenario/optimizer/agent_tool/data_connector`) for self-registration, and `load_plugins()` which walks `hubris.plugins.{metrics,scenarios,optimizers}` via `pkgutil` so dropping a new plugin file in is enough — no registry/agent code changes needed. `as_agent_tools()` wraps every registered `Metric`/`ScenarioModule`/`OptimizerStrategy` in a thin `AgentTool` adapter whose `run()` calls the real `compute`/`apply`/`optimize` and returns `.model_dump()` — computed JSON only. Proved the keystone property in `tests/test_registry.py`: a dummy `Metric` plugin registered only via `@register_metric` shows up in `registry.all("metric")` and as `as_agent_tools()`'s `"metric_dummy_spare_capacity"` tool, and calling it returns a number derived from `NetworkModel` data, not asserted independently. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/ -v"` → 6 passed.

**T-04 · Synthetic EMX dataset fixtures**
Contract: fills every canonical table (`SCHEMA.md §3`). Depends on: T-02.
Done when: ~7–10 hubs, ~50–150 zones, 3–4 fleet types, demand, and a plausible current assignment load into `NetworkModel`.
Log:
- WIP — Claude — 2026-07-31
- REVIEW — Claude — 2026-07-31 — `backend/hubris/data/synthetic.py`: `generate_synthetic_raw_tables(seed=42)` deterministically builds 9 hubs (2 each in Dubai/Abu Dhabi, 1 in each of the other 5 emirates), 100 zones spread across all 7 emirates (weighted toward Dubai/Abu Dhabi), 4 fleet types (Bike/Van/Small Truck/Truck, network-wide not hub-pinned), a full hub×zone `od_matrix` (haversine × 1.3 road-factor fallback per `SCHEMA.md §2`, cost = distance × Van's cost_per_km + hub handling_cost), and a nearest-open-hub-with-capacity baseline `current_assignments` that splits a zone across hubs when the nearest one doesn't have room. To test: `docker build -t hubris-backend ./backend && docker run --rm -v $(pwd)/backend:/app -w /app hubris-backend sh -c "pip install -q pytest && python -m pytest tests/ -v"` → 12 passed, incl. `test_synthetic_data.py`: counts in spec, hydrates into `NetworkModel`, deterministic per seed, every zone's demand fully assigned, no hub capacity exceeded, od_matrix covers every hub×zone pair.

**T-05 · Canonical schema + Postgres migrations**
Contract: `SCHEMA.md §1`. Depends on: T-01.
Done when: all canonical tables migrate cleanly; ORM models match; synthetic data persists and reloads.
Log:

### Phase 1 — Engine (critical path)

**T-06 · Ingestion + schema mapper (DataConnector)**
Contract: `DataConnector`. Depends on: T-04, T-05.
Done when: an Excel → canonical mapping runs with fuzzy + LLM-assisted column matching + low-confidence confirm; downstream reads only canonical tables (`SCHEMA.md §2`).
Log:

**T-07 · Cost/KPI calculator (Metric plugins)**
Contract: `Metric`. Depends on: T-02, T-04.
Done when: cost-to-serve, utilisation, coverage, spare-capacity metrics compute for any config; each has a hand-checkable fixture; each registered and exposed as an agent tool.
Log:

**T-08 · Min-cost flow assignment + duals**
Contract: engine (`assign(model) -> Assignment(+duals)`). Depends on: T-04.
Done when: optimal zone→hub for baseline/scenarios; always solves; returns shadow prices for T-23. Tiny 2-hub/3-zone test passes.
Log:

**T-09 · MILP recommender + greedy fallback**
Contract: `OptimizerStrategy`. Depends on: T-08.
Done when: binary hub open/close/move + fleet mix minimises cost; returns `Recommendation` with delta-vs-baseline; greedy fallback triggers if MILP slow/infeasible.
Log:

**T-10 · Scenario modules**
Contract: `ScenarioModule` (one plugin each: `move_hub`, `close_hub`, `add_hub`, `change_fleet_mix`, `add_customer`, `demand_scale`). Depends on: T-02, T-07.
Done when: each `apply()` returns a modified **copy**; each has a params schema; each registered; baseline + scenario coexist for diffing.
Log:

### Phase 2 — Agents

**T-11 · LangGraph agent tools wrapping the engine**
Contract: `AgentTool`. Depends on: T-07, T-08, T-09.
Done when: tools (`get_kpis`, `find_spare_capacity`, `simulate_scenario`, `optimise_network`, `compare_scenarios`) return computed JSON only; wired from the registry.
Log:

**T-12 · Multi-agent workforce graph**
Contract: LangGraph graph. Depends on: T-11.
Done when: Network Analyst / Scenario Strategist / Optimizer / Cost Analyst / Risk agents collaborate to answer a question, every number traceable to a tool call.
Log:

**T-13 · Goal-driven optimisation loop**
Contract: agent loop over T-09/T-08. Depends on: T-11.
Done when: a plain-English objective ("cut cost 5%, no hub >90%") drives simulate→optimise→evaluate iterations and returns the answer + the path explored.
Log:

**T-14 · Agent Builder (custom agents + templates)**
Contract: agent = name + goal + allowed registry tools + autonomy mode. Depends on: T-11.
Done when: a new agent can be created (2–3 seeded templates) and works immediately using registry tools; persists; can't answer with non-tool numbers.
Log:

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
