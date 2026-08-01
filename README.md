# Hubris — an agentic control tower for the logistics network

> Next Mile Hackathon · 7X × 42 Abu Dhabi · Track: **Predictive Network Optimisation**
> Team: **Hubris** · Build window: 5–6 Aug 2026 (24h, dataset revealed at event start)

*(The name "Hubris" is used for both the team and the product. To rename the product, change it here and in `VISION.md`; nothing in the code depends on it.)*

---

## What this is, in one line

**A web-based control tower for EMX's network planners: see the whole network in one view, test any change before making it, and get an explained, quantified recommendation on what to do next — driven by a team of AI agents you can extend and customise.**

## The 20-second version

EMX's network (hubs, fleets, service models) lives in siloed systems, so no one sees the whole picture. Answering a single planning question ("can we absorb this customer? which hub has spare capacity? what does it cost to serve emirate A vs B?") takes ~8 hours of manual spreadsheet work. The strategic questions ("move a hub? change the fleet mix?") never get asked because there is no safe way to test a change.

Hubris is a **network digital twin**: a live model that unifies the data, **simulates changes before they happen**, and **recommends the most efficient network shape** — with a deterministic optimisation engine doing the real maths and an agent layer orchestrating and explaining it.

## Why we win (not just "a twin with a chatbot")

1. **Real computation, provable value.** A genuine operations-research core (capacitated facility location + min-cost flow) produces a measurable ~5% cost-to-serve reduction — not an LLM guessing numbers.
2. **An agentic platform, not a single-agent app.** A customisable multi-agent workforce, a no-code **Agent Builder**, and a **goal-driven optimisation loop** where agents drive the solver toward a plain-English objective.
3. **Operator-useful features nobody else builds.** An opportunity scanner, a threshold/break-even finder, a prescriptive bottleneck unlock, and an auto-generated decision brief — features a real planner calls genuinely useful, not just impressive.
4. **Extensible by design.** Every capability is a plugin. Adding a metric, a scenario, an optimiser, or a whole new agent takes minutes and requires no core changes.

## Running it locally

```bash
cp .env.example .env      # then paste your ANTHROPIC_API_KEY into it
docker compose up -d      # db + backend + frontend; migrations run automatically
```

- **UI:** http://localhost:3000 · **API docs:** http://localhost:8000/docs
- The app seeds itself from the synthetic EMX-shaped dataset on boot — there is no manual seed step.
- Without an `ANTHROPIC_API_KEY` everything still runs; only the agent chat / goal loop go quiet (every engine number, scenario, optimiser run, scanner finding and decision brief is computed without an LLM).

Run the tests (the DB test needs the compose db up):

```bash
docker build -t hubris-backend-test ./backend
docker run --rm --network hubris_default \
  -e DATABASE_URL="postgresql+psycopg2://hubris:hubris@db:5432/hubris" \
  -v "$(pwd)/backend:/app" -w /app hubris-backend-test python -m pytest tests/ -q
```

Tests that need a live `ANTHROPIC_API_KEY` or network access skip themselves automatically, so a clean checkout is always green.

## The documents (read in this order)

| File | For whom | What it gives you |
|------|----------|-------------------|
| **[VISION.md](./VISION.md)** | The team (and the judges) | The product story, who it's for, why it wins, how to contribute, and full **Q&A prep** for the pitch. |
| **[BUILD_SPEC.md](./BUILD_SPEC.md)** | Builders | The master spec: features tiered (core / accuracy / stretch), the plugin + agent contracts, KPI strategy, and the pre-build vs 24-hour plan. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Builders | The layered architecture, data flow, and how the pieces connect. |
| **[SCHEMA.md](./SCHEMA.md)** | Builders | The canonical data model everything maps onto, and the schema-agnostic ingestion strategy. |
| **[CLAUDE.md](./CLAUDE.md)** | Claude Code & any AI contributor | Conventions, the non-negotiable guardrail, and **exactly how to add a new plugin or agent**. |

## The one rule that never moves

**Agents orchestrate and explain. The deterministic engine computes. No agent ever invents a number.**

Every figure an agent reports is traceable to a real tool call against the engine. This is what keeps the AI genuinely load-bearing instead of decorative — and it is the single most important thing separating a winning build from a losing one on this track.

## Status

Strategy and architecture: **locked** (cross-checked against six independent LLM analyses).
Build: **starting now**, pre-event, on synthetic EMX-shaped data. The real dataset arrives at event start and plugs into the schema-agnostic ingestion layer.
