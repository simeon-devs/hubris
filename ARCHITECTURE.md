# ARCHITECTURE — Hubris

> How the pieces connect. Read `BUILD_SPEC.md` for *what* to build and `CLAUDE.md` for the plugin contracts.

---

## 1. Design principle

**Thin, stable core + everything else is a plugin.** The core holds only the unified network model, the plugin registry, and the orchestrator. Every capability — a data connector, a metric, a scenario, an optimiser, an agent tool — registers against a defined interface and is discovered at startup. This is what makes the platform extensible and lets the team build in parallel.

## 2. Data flow (end to end)

```
        Excel / source (revealed at event start)
                     │
                     ▼
   ┌──────────────────────────────────┐
   │ 1. Ingestion & schema mapper      │  fuzzy + LLM-assisted column → canonical
   │    (DataConnector plugins)        │  mapping; human-confirm if low confidence
   └──────────────┬───────────────────┘
                  ▼
   ┌──────────────────────────────────┐
   │ 2. Canonical model (PostgreSQL)   │  hubs, zones, fleet, demand, od_matrix,
   │    + in-memory NetworkModel       │  current_assignments, scenarios, results
   └──────────────┬───────────────────┘
                  ▼
   ┌──────────────────────────────────┐
   │ 3. Compute engine (deterministic) │
   │   a. Cost/KPI calculator (NumPy)  │  ← the always-solves live view
   │   b. Min-cost flow (+ duals)      │  ← baseline & scenario assignment
   │   c. MILP recommender (+greedy)   │  ← open/close/move + fleet mix
   │   (stretch) SimPy waves           │
   └──────────────┬───────────────────┘
                  ▼
   ┌──────────────────────────────────┐
   │ 4. Plugin registry                │  Metrics · ScenarioModules ·
   │                                   │  OptimizerStrategies · AgentTools ·
   │                                   │  DataConnectors
   └──────────────┬───────────────────┘
                  ▼
   ┌──────────────────────────────────┐
   │ 5. Agent layer (LangGraph/Claude) │  multi-agent workforce · Agent Builder ·
   │    tools = registry.as_tools()    │  goal-driven loop · scanner/threshold/
   │    (agents call tools, never       │  unlock/decision-brief
   │     compute numbers)              │
   └──────────────┬───────────────────┘
                  ▼
   ┌──────────────────────────────────┐
   │ 6. API (FastAPI)                  │  /ingest /kpis /simulate /optimize
   │                                   │  /agent/query /agents (CRUD) /scenarios
   └──────────────┬───────────────────┘
                  ▼
   ┌──────────────────────────────────┐
   │ 7. Frontend (Next.js + deck.gl)   │  map · KPI cards · scenario panel ·
   │                                   │  agent chat · Agent Builder · brief view
   └──────────────────────────────────┘
```

## 3. Module responsibilities & interfaces

| # | Module | Responsibility | Key interface |
|---|--------|----------------|---------------|
| 1 | Ingestion | Read source, map to canonical schema, geocode if needed | `DataConnector.load(source) -> RawTables` |
| 2 | Canonical model | Single source of truth; build the `NetworkModel` graph | SQLAlchemy models + `NetworkModel` |
| 3a | Cost/KPI calculator | Deterministic KPIs for any config | `compute(model, scenario) -> MetricResult` |
| 3b | Flow assignment | Optimal zone→hub + duals | `assign(model) -> Assignment(+duals)` |
| 3c | MILP recommender | Hub open/close/move + fleet mix | `OptimizerStrategy.optimize(model, objective, constraints) -> Recommendation` |
| 4 | Registry | Discover/hold plugins; expose as agent tools | `registry.get/all/as_agent_tools()` |
| 5 | Agent layer | Orchestrate tools, explain results | LangGraph graph; tools wrap the engine |
| 6 | API | Expose everything over HTTP | REST/JSON (FastAPI) |
| 7 | Frontend | Visualise + interact | React components → API |

## 4. The unified `NetworkModel`

The in-memory object every engine and plugin operates on. Immutable per scenario — a `ScenarioModule.apply()` returns a *modified copy*, so baseline and scenario always coexist for diffing.

Holds: `hubs`, `zones`, `fleet_types`, `demand`, `od_matrix`, `assignments`, plus derived caches (distances, cost matrix). Backed by NetworkX for graph operations; hydrated from Postgres.

## 5. Why the agent never computes

Agent tools are thin wrappers over modules 3a–3c. A tool returns **computed JSON**; the agent composes prose and chooses the next tool. The arithmetic lives in Python/solver. This is enforced structurally: agents are given tool outputs and a schema that expects them to *cite* tool results, not emit free-floating numbers. See `CLAUDE.md` for the enforcement pattern.

## 6. Tech stack (confirmed)

- **Backend:** Python, FastAPI, SQLAlchemy, PostgreSQL.
- **Engine:** OR-Tools / PuLP (+CBC), NetworkX, NumPy/Pandas; H3 for zoning; OSRM/Valhalla or ORS for distances; SimPy (stretch); Prophet (stretch).
- **Agents:** LangGraph + Claude API; Qdrant (stretch, memory).
- **Frontend:** Next.js/React, deck.gl + react-map-gl (MapLibre basemap — no paid token), recharts.
- **Infra:** Docker Compose (Postgres + backend + frontend) for one-command spin-up.

## 7. Repo layout (suggested)

```
hubris/
├─ backend/
│  ├─ hubris/
│  │  ├─ core/            # NetworkModel, contracts, registry, orchestrator
│  │  ├─ ingestion/       # DataConnector plugins, schema mapper
│  │  ├─ engine/          # cost calculator, flow, MILP, greedy, (simpy)
│  │  ├─ plugins/
│  │  │  ├─ metrics/      # Metric plugins
│  │  │  ├─ scenarios/    # ScenarioModule plugins
│  │  │  └─ optimizers/   # OptimizerStrategy plugins
│  │  ├─ agents/          # LangGraph graph, workforce, builder, loop, tools
│  │  ├─ api/             # FastAPI routers
│  │  └─ data/            # synthetic EMX-shaped fixtures
│  └─ tests/
├─ frontend/              # Next.js app
├─ docker-compose.yml
└─ docs/  → README, VISION, BUILD_SPEC, ARCHITECTURE, SCHEMA, CLAUDE
```
