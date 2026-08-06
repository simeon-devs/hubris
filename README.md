# EMX ATLAS — the network digital twin

> Next Mile Hackathon · 7X × 42 Abu Dhabi · Track: **Predictive Network Optimisation** · Team **Hubris**

**Try it now: https://emx-atlas-app.onrender.com** *(free-tier instance — first load after idle can take ~50s)*

EMX's network lives in siloed spreadsheets: answering "can we absorb this customer?" takes ~8 hours, and "should we close a hub?" never gets asked because there is no safe way to try. ATLAS rebuilds the network — hubs, dark stores, on-demand, riders, fleet — as a **live working copy of EMX's own dataset**, simulates any change before it happens, and recommends the best network shape with the price of every trade-off computed.

---

## The one rule

**The maths computes. The AI explains. Neither crosses the line.**

```
your question → ① AI picks the calculation → ② deterministic engine computes
             → ③ AI phrases the answer     → ④ verifier traces every number to a tool result
             → your screen (badge: verified / self-corrected / flagged)
```

The LLM appears exactly twice — choosing tools and phrasing answers. It never touches the solvers, the KPIs, or the alerts. Step ④ is measured, not assumed: without it, the model invented a figure in 3 of 5 live runs; with it, an untraceable number cannot reach the screen — it gets flagged, by name.

## What it does

- **Map** — all three networks live, with the real crisis the engine found on its own: 17 orders/day in Abu Dhabi that cannot be served (their own demand vs their own store capacity).
- **Simulate** — 12 what-if scenarios (close / absorb / open / convert a hub, resize, fleet mix, surge, service-mix shift, merge delivery areas, riders, demand, new customer) on either twin — Hub & Spoke or the QComm dark-store network. Every run is a real re-solve.
- **Optimize** — MILP facility location with a resilience frontier: the raw optimum (close 8, −34%) shown as evidence, the resilient plan (close 4, −28%, a hub in every emirate) recommended, and the premium between them — ≈2,700 AED/day — computed, not guessed.
- **Agents** — two self-running watchdogs sweep the twin every 5 minutes and raise attributed alerts; a builder deploys new agents that can only hold registry tools — so no agent can ever answer with a number that didn't come from the engine.
- **Reports** — adopted decisions, team-analysis briefs of every saved run, branded PDF export.
- **MCP** — the same engine tools are exposed over MCP: the twin is operable from Claude on your own machine.

## Trust, demonstrated

We rebuilt EMX's cost model and reconciled it against their own report: **10.91 vs 10.91** AED/parcel variable, **60.11 vs 60.11** fully loaded, on both networks ([examples/reconciliation.md](examples/reconciliation.md)). The same pass surfaced a real inconsistency in the source workbook — the cost sheet and the demand sheet disagree about daily volume by 1.55× — which we report labelled on both bases rather than averaging away.

## Run it locally

```bash
cp .env.example .env      # paste your ANTHROPIC_API_KEY (chat works without it; numbers always do)
docker compose up -d      # Postgres + engine + app — migrations run, the twin seeds itself
```

- **App:** http://localhost:3001 · **API docs:** http://localhost:8000/docs
- Boot is self-contained: the real dataset ships in the package, the baseline and the QComm crisis twin load themselves, the watchdog raises the first alerts on its own schedule.

Tests (hand-checkable fixtures for every engine function; agent tests skip without a key):

```bash
docker build -t hubris-backend-test ./backend
docker run --rm --network hubris_default \
  -e DATABASE_URL="postgresql+psycopg2://hubris:hubris@db:5432/hubris" \
  -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest tests/ -q
```

## Stack

| Layer | What | Its one job |
|---|---|---|
| Engine | Python · scipy (HiGHS LP) · PuLP/CBC (MILP) · pandas | every number on every screen |
| Memory | Postgres | episodes, alerts, heuristics — each row carries provenance |
| Agents | LangGraph + Claude (Anthropic) | choose tools, phrase answers — nothing else |
| Guardrail | pure-Python provenance verifier | trace every figure before the screen |
| App | React · TanStack Start · Leaflet | formats numbers, computes none |
| Surface | FastAPI · MCP · Docker · Render | register a plugin once → UI, chat and MCP get it automatically |

Everything extensible is a plugin behind one registry — a new scenario or metric needs zero wiring to appear in the UI, the chat, and MCP.

## Team

**Hubris** — built in 24 hours on the event dataset, deployed the same day.
