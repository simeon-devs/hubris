# VISION — Hubris

> The north star. If you read one doc before building, read this.
> Team-facing: who this is for, the story, why it wins, and how to contribute.
> Ends with **Q&A prep** — questions your teammates will ask, and questions the judges will ask.

---

## 1. The north star (one paragraph)

We are not building "a dashboard with an AI chatbot." We are building an **agentic operating system for a logistics network**. The digital twin is the *substrate* — a live, computable model of EMX's network. The **agent layer is the product** — a customisable workforce of AI agents that watch the network, simulate changes, find opportunities the planner didn't know to look for, and recommend what to do next, always grounded in real computation. The test for every feature we build: **would a real EMX planner say "we never thought of that, and it would genuinely help us"?** If not, we cut it.

## 2. Who it's for

Not the courier. Not the customer. **The planners and decision-makers inside EMX** — the people who shape the network:

- **Network / capacity planners** — the ones doing the 8-hour manual analysis today. *Primary users.*
- **Operations managers** — "can we absorb this customer?", "which hub is overloaded?"
- **Strategy / leadership** — the big calls: move a hub, change fleet mix, expand into a new emirate.

Think **control room, not delivery van.** The full "last-mile routing" track was for the driver's day. Ours is for the people who design the whole system.

## 3. The problem (in their words)

- The network is siloed — no single view of capacity, demand, utilisation, coverage, and cost.
- One planning question = ~8 hours of manual work, and the answer depends on who you ask.
- The strategic "what if we changed the network?" questions never get asked, because there's no safe way to test them.

## 4. The product story (the demo arc)

1. **"Here's your entire network in one view."** Every hub, its utilisation, its cost-to-serve, where the demand is. The 8-hour question becomes instant.
2. **"Ask it anything."** A planner asks in plain language; an agent answers with a computed, explained result.
3. **"Watch a what-if."** Drag a hub, change the fleet mix, or type "close Ajman and grow Sharjah demand 30%" → the whole network recomputes live: cost, capacity, coverage.
4. **"Now let it think for you."** The opportunity scanner surfaces waste nobody queried; the threshold finder answers "at what growth does Hub B break?"; the optimiser recommends a better network shape — the ~5% saving — and explains *why*.
5. **"And build your own analyst."** Spin up a custom agent live ("watch cost-to-serve per emirate, flag anything above X, propose a fix") — it works immediately, because it wires into the same real engine.

## 5. Why we win — mapped to the judging rubric

| Criterion | Weight | How we score it |
|-----------|:------:|-----------------|
| AI Implementation Quality | 25% | Agents do real, tool-grounded work; a genuine OR engine computes every number. The guardrail (agents never invent numbers) is enforced architecturally. |
| Problem–Solution Fit | 25% | We hit both stated targets (~5% cost-to-serve, 80% of decisions on-platform) and answer the exact pain-point questions from the brief. |
| Technical Execution | 25% | Clean modular architecture, a plugin registry, deterministic core with an always-solves path so the demo never dies. |
| Real-World Viability | 15% | A platform EMX can extend — new metrics, scenarios, agents in minutes — plus human-in-the-loop governance. Pilotable, not a one-off. |
| Presentation | 10% | The live "build-an-agent-on-stage" beat, the drag-a-hub recompute, and an auto-generated decision brief. |

## 6. The features that make a planner lean in

- **Opportunity scanner** — surfaces inefficiencies nobody queried ("Hubs C and D overlap coverage — you're paying twice").
- **Threshold / break-even finder** — "at what demand growth does Hub B need expanding?" The tipping points planners compute by hand today.
- **Prescriptive bottleneck unlock** — not just "Hub B is the constraint" but "the cheapest unblock is +50 units at Hub B, costing X, unlocking Y."
- **Auto decision-brief** — the one-page business case for leadership, generated automatically. Saves a planner half a day.
- **Customisable multi-agent workforce + Agent Builder** — a digital planning department you can extend without code.
- **Goal-driven optimisation loop** — "find a shape that cuts cost 5% with no hub over 90%" → the agent drives the solver and shows the path it explored.

## 7. How to contribute (team)

The whole system is built so we can work in **parallel** from hour zero, because everything hangs off a small stable core plus plugins.

**Suggested work-split (2–4 generalists):**

- **Owner A — Engine & data.** Canonical schema, ingestion/mapping, the deterministic compute layers (cost calculator, min-cost flow, MILP). *The most critical path — start here first.*
- **Owner B — Agent layer.** LangGraph multi-agent graph, the tool wrappers over the engine, Agent Builder, goal-driven loop.
- **Owner C — Frontend.** Next.js + map (deck.gl), KPI cards, scenario panel, agent chat, before/after diff.
- **Owner D (or shared) — Accuracy & polish.** Road-distance integration, Monte Carlo confidence bands, demo scenario seeding, pitch.

**The rule that lets us parallelise:** everyone builds against the **plugin contracts** in `CLAUDE.md`. If your piece implements the interface, it drops into the registry and the rest of the system can use it — no coordination meetings required.

**Priority order (do not invert):** engine that computes → agents that call it → features on top → accuracy → polish. A plain thing that computes beats a beautiful thing that fakes it, every time.

---

## 8. Q&A PREP

Two sets. First, questions **teammates** commonly ask (align the team). Second, questions the **judges** will ask (rehearse these out loud before the pitch). Where an answer needs a number we won't have until the dataset drops, the honest framing is given.

### 8a. Questions your teammates might ask

**"Isn't this too ambitious for 24 hours?"**
No, because ~80% is pre-built on synthetic data *before* the event, and we have AI-assisted coding. On the day we plug in real data and generate the real recommendations. The plugin architecture also means unexpected scenarios are one new plugin, not a rewrite.

**"What if the dataset looks nothing like we expect?"**
The ingestion layer is schema-agnostic (fuzzy + LLM-assisted column mapping → canonical schema). Everything downstream depends only on the canonical schema, never on raw column names. Budget the first 1–2 hours for mapping; the rest is insulated.

**"Where exactly does the AI 'do real work' — aren't we just wrapping an LLM?"**
The LLM never computes a number. It decides *which* computation to run, calls the engine as a tool, and explains the result. The maths lives in OR-Tools/PuLP/NumPy. That separation is the whole point.

**"What's the minimum we must have working to not embarrass ourselves?"**
The always-solves core: ingest → unified view → min-cost-flow baseline → one what-if that recomputes → one agent that answers with real numbers. Everything else is upside on top of that floor.

**"Why not do live-routing / VRP — isn't that more impressive?"**
That was the *other* (full) track, and full VRP is a 24-hour black hole that doesn't answer network-shape questions. We stay at network-design altitude and approximate last-mile cost.

**"Who owns what, and how do we avoid stepping on each other?"**
See §7. Everyone builds against the plugin contracts; if it implements the interface, it drops in. That's how four people build in parallel without merge chaos.

### 8b. Questions the judges will ask (rehearse these)

**"Is the AI actually doing something, or is it decorative?"**
*This is the question the whole build is designed to answer.* Every number the agents report comes from a deterministic tool call — we can show the tool output behind any answer. The intelligence is in *orchestrating* the engine (which computation, in what sequence, toward what goal) and *explaining* the result in business terms, not in generating the numbers.

**"How do you get the 5% cost-to-serve reduction? Is it real?"**
It's the delta between the network's **current** cost-to-serve (baseline) and the **optimised** assignment/shape the engine finds. We decompose *where* the saving comes from (line-haul vs handling vs consolidation) so it's transparent, not a black box. Honest caveat: if their current network is already near-optimal, the available saving may be smaller — in which case we pivot the headline to coverage gains, capacity-headroom insight, and decision speed (8 hours → seconds). *(Have this fallback ready — don't oversell a fixed 5%.)*

**"What does the 80% figure actually mean?"**
It's a proxy: the fraction of the standard planning questions a planner asks (absorb a customer? spare capacity? cost A vs B? move a hub? change fleet mix? two waves?) that the platform answers automatically in seconds instead of hours. We show the checklist and demonstrate each — we're explicit that it's a coverage proxy, not a deployed-adoption statistic.

**"Could EMX actually pilot this?"**
Yes — it's API-first, PostgreSQL-backed, and extensible. New metrics, scenarios, and agents are plugins. It has human-in-the-loop approval so recommendations are governed, not auto-applied. The road from prototype to pilot is adding real data connectors, which the architecture already anticipates.

**"How accurate are your cost numbers?"**
We use real road distances (not straight-line) and attach Monte Carlo confidence bands, so a recommendation reads "cuts cost ~5.2%, holds under demand ±20%." Ranges, not false precision.

**"What happens when the network gets large — does it still solve?"**
The live view runs on min-cost flow, which always solves fast. The heavier MILP (hub open/close) has a greedy fallback and time limits, and demand is aggregated to zones/hex-cells to keep the problem tractable. The demo never hangs.

**"What's genuinely novel here versus existing tools (anyLogistix, Coupa/Llamasoft)?"**
Those are heavyweight enterprise tools operated by specialists. Our novelty is the **agentic layer**: a customisable workforce that proactively finds opportunities and lets a non-specialist planner extend the system by describing an agent in plain English. We bring the digital-twin idea down to a control-tower a planner drives conversationally.

**"What would you build next with more time?"**
Demand forecasting so the twin projects forward and pre-empts problems; institutional memory so it recalls past decisions and their rationale; deeper service-model and multi-period optimisation; and production data connectors into EMX's live systems.

**"What was the hardest part / what did you cut?"**
Honest answer: keeping the AI grounded (never letting it invent numbers) and resisting scope creep. We deliberately cut demo-only flash that added no operator value, to keep the core computing reliably.

### 8c. Open questions for us to resolve when the data lands

- Does the dataset include the **current zone→hub assignment**? If yes, that's our baseline directly; if no, we reconstruct a nearest-hub status-quo proxy.
- Are **coordinates** present, or only region names (needing geocoding)?
- Is there a **time series** of demand (enables the forecast stretch) or only a snapshot?
- What's the **scale** (number of hubs/zones)? Decides MILP-exact vs heuristic.
- Is there an explicit **cost model**, or do we derive cost from distance × rate + handling?

These are flagged so we answer them in the first 30 minutes on the day rather than mid-build.
