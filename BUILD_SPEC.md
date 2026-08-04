# BUILD_SPEC — Hubris

> The master build spec. What we build, in what order, and against which contracts.
> Companion docs: `ARCHITECTURE.md` (how it connects), `SCHEMA.md` (the data model), `CLAUDE.md` (how to add plugins/agents).

---

## 1. The concept in one line

A **network digital twin** for EMX: unify siloed network data → simulate changes safely → recommend and explain the optimal network shape — deterministic engine computes, agent layer orchestrates and explains.

## 2. Problem formalisation (settled)

The core is a **Capacitated Facility Location Problem (CFLP) + capacitated min-cost flow assignment**, with demand aggregated to zones/emirates (or H3 hex cells). We deliberately **do not** solve street-level VRP — it's a 24-hour black hole that doesn't answer network-shape questions. Last-mile cost is approximated (distance × cost-per-km + per-stop / handling).

The business questions map to canonical OR problems:

| Planner question | Formal problem |
|---|---|
| "Which hub has spare capacity? / can we absorb a customer?" | Capacitated assignment + capacity feasibility |
| "Cost to serve emirate A vs B?" | Min-cost flow + cost-to-serve accounting |
| "Move / open / close a hub? network shape as demand grows?" | Capacitated facility location (binary open/close) |
| "Change fleet mix / run two waves?" | Fleet sizing + (light) period assignment; scenario sim |
| "Coverage %?" | Maximal-covering-style constraint within an SLA radius |

## 3. Mathematical core (reference)

**Sets:** `I` demand zones, `J` hubs, `K` fleet/service types (optional).
**Params:** `d_i` demand, `f_j` fixed hub cost, `Q_j` hub capacity, `c_ij` unit serve cost (transport + handling), `t_ij` distance/time.
**Vars:** `y_j ∈ {0,1}` open hub, `x_ij ≥ 0` flow zone→hub.

Objective: `min Σ f_j·y_j + Σ c_ij·x_ij`
Subject to:
- Demand met: `Σ_j x_ij = d_i  ∀i`
- Capacity, only if open: `Σ_i x_ij ≤ Q_j·y_j  ∀j`
- SLA radius: `x_ij = 0 if t_ij > T_max`

**Utilisation:** `u_j = (Σ_i x_ij) / Q_j`.
**Cost-to-serve for region R:** `(Σ transport + allocated fixed) / Σ demand`.

**24h simplifications:** treat `x_ij` continuous (LP) for the live view; keep `y_j` binary only for the open/close recommendation; single-period; derive cost from distance if no cost model given. **Shadow prices (duals) come free from the flow LP** — use them for the prescriptive "bottleneck unlock" feature.

## 4. The three compute layers (this is the engine)

Built bottom-up, in this priority order:

1. **Cost/KPI calculator** — vectorised NumPy/Pandas. Any config in → cost-to-serve, utilisation, coverage, spare capacity out. Instant, never fails. Powers the live what-if.
2. **Min-cost flow assignment** — NetworkX / OR-Tools, fixed hubs. Optimal demand→hub for baseline and scenarios, **plus the duals** for shadow-price explanations. Always solves.
3. **MILP recommender** — PuLP+CBC (or OR-Tools) with binary `y`. Hub open/close/move + fleet mix → the ~5% delta. **Greedy fallback** (marginal-cost reassignment) if MILP is slow/infeasible.

*(Stretch)* **SimPy** discrete-event layer for the "two delivery waves" throughput question — only if the core is solid.

## 5. The agentic layer

Agents are **compositions of tool-plugins** from the registry (see `CLAUDE.md`). The LLM (Claude API via LangGraph) decides *which* tools to call and explains results — it never computes numbers.

**5.0 Runtime provenance verification — "the AI that cannot lie" (W1, existential)**
Every agent answer is checked against the tool results it actually received *before* it
leaves the backend. Numbers in the prose with no traceable tool source are caught; the
answer is regenerated once, and if it still fails it is returned marked `flagged` with the
untraceable figures named. The verdict rides on the API response and is rendered in the UI.

This is not belt-and-braces — it is the load-bearing enforcement. Measured: with prompt-only
enforcement, a seeded agent fabricated a figure in **3 of 5 consecutive live runs** (it
multiplied two real tool numbers and presented the product as fact). See `STATUS.md`.
**No code path may return agent prose to a user without passing the verifier.**

**5.1 Multi-agent workforce with computed adversarial review** — specialist agents mirroring EMX roles:
- **Network Analyst** — reads current state, finds bottlenecks.
- **Scenario Strategist** — proposes what-ifs.
- **Optimizer** — drives the solver.
- **Cost Analyst** — cost-to-serve decomposition, shadow prices.
- **Risk / Devil's Advocate** — stress-tests recommendations (demand +30%).

A router classifies the planner's question and dispatches the right specialist with a
restricted toolset. The **adversarial-review guarantee is computed, not conversational**:
every Optimizer recommendation ships with a Monte Carlo robustness band (T-20) that
challenges it with real engine numbers — *"holds under ±20% demand, feasible in 100% of 50
trials"* — and the Risk role has `optimise_network` + the threshold finder to answer
"at what point does this break?" with a searched, re-solved tipping point.

> **Decision (Sims, 2026-08-04): the full swarm — stateless specialists with live
> inter-agent handoffs (formerly W5/T-41) — is CUT and must not be built.** Measured
> single-agent misbehaviour (3 of 5 live runs, `STATUS.md`) makes a live multi-agent chain
> too fragile for the demo path, and the bands already deliver the challenge with real
> numbers. Do not resurrect without a new decision.

**5.2 Agent Builder (no-code)** — a planner defines a new agent: name, plain-English goal, allowed tools (from the registry), autonomy (on-demand vs monitoring). It registers and works immediately. This is the signature "customisation" feature and the live-demo highlight.

**5.3 Goal-driven optimisation loop** — an agent takes a natural-language objective ("cut cost 5%, no hub over 90%") and autonomously runs simulate → optimise → evaluate until satisfied, returning the answer **plus the path explored**. The optimiser is the agent's tool, not the whole show. It must be reachable as a **registry tool, an API route, and a UI control** — an implementation nobody can invoke does not count as built.

**5.4 The learning twin — three-tier memory (W2)**
The twin gets better the longer EMX uses it. Backed by Postgres (see `SCHEMA.md §1a`):
- **Episodic** — every scenario run, its params, its KPIs, and its outcome. "What have we already tried?"
- **Semantic** — facts learned about *this* network ("H5 binds first under Sharjah growth"). Accumulated from real runs, never asserted.
- **Procedural** — decision patterns and **agent-written heuristics** that get applied in later sessions ("when a structural gap persists ≥4 weeks, prefer permanent capacity").

An agent can *record* a heuristic via a tool, which stamps provenance automatically. Memory
carries the same guarantee as everything else: every stored number names the tool run that
produced it. **Memory is not a fabrication loophole.**

**5.5 Closed-loop autonomous monitoring (W4)** — `monitoring` autonomy becomes real.
`capacity_watchdog` self-runs on a schedule, scans the network, **runs an actual simulation**
(not a threshold check on cached KPIs), and pushes an alert card carrying a computed finding,
a recommended action, and a link to the generated decision brief. This closes the loop:
observe → simulate → recommend → record to episodic memory.

**5.6 Hubris as an MCP server (W6)** — the registry's tools (`get_kpis`, `simulate_scenario`,
`optimise_network`, `scan_opportunities`, …) are exposed over the Model Context Protocol, so
any external AI or system can operate the network twin. Because the adapter reads the
registry, **registering a plugin publishes it to MCP automatically** — the same property that
makes it available to every internal agent. Architectural credibility: the twin is a
platform, not an app.

## 6. Operator-useful features (the "we never thought of that" tier)

All ride the same engine + loop machinery, so they're cheap together:

- **Opportunity scanner** — proactively surfaces inefficiencies nobody queried (overlapping coverage, demand served from a far hub, idle capacity next to overload).
- **Threshold / break-even finder** — "at what demand growth does Hub B need expanding? how many customers before SLA breaks?" Drives the loop to find the tipping point.
- **Prescriptive bottleneck unlock** — turns the LP duals into "the cheapest way to unblock is +N units at Hub B, costing X, unlocking Y."
- **Auto decision-brief** — generates the one-page leadership business case (current state, change, cost/risk, what it unblocks, sensitivity).
- **Time Machine — temporal navigation (W3)** — a scrubber over the map. Drag **back** through recorded history and past decisions (from episodic memory; degrades gracefully to an explicit "no recorded history yet" empty state when no episodes exist), **forward** through **scenario projections**. The map re-renders live as you scrub. Paired with **active/inactive flow visuals**: routes that drop out go grey, routes taking over the volume highlight — so a planner *sees* the network reshape rather than reading a diff table. This is the single most demo-legible feature in the build.
  **Naming rule (Sims, 2026-08-04): the forward direction is "scenario projections", never "forecast" — in UI labels, API fields, agent explanations and briefs.** We have no demand forecast until T-25 exists; a `forecast_*` identifier in this feature is a review-blocking defect. If T-25 ever lands, renaming becomes a deliberate upgrade, not a retrofit.

## 7. Accuracy backbone

- **Real road distances** — OSRM/Valhalla (self-hosted) or OpenRouteService for drive-time matrices; **H3** hex grid to aggregate messy demand into clean zones. Makes the numbers trustworthy vs everyone else's straight-line haversine. *(Fallback: haversine × ~1.3 road factor if road engine setup is at risk.)*
- **Monte Carlo confidence bands** — every recommendation ships with a robustness range ("holds under demand ±20% at 95%"). Pure NumPy.

## 8. Stretch (only if core is solid)

- **Demand forecast** (Prophet/statsmodels) — twin projects forward; scanner pre-empts problems. *Also unlocks the forward half of the Time Machine (W3); until it exists, "forward" scrubs over scenario projections rather than a learned forecast.*
- **SimPy waves** — throughput/queueing for the two-wave question.

*(Institutional memory has been promoted out of Stretch — it is now W2, backed by Postgres rather than Qdrant. Semantic vector search over memory stays optional; the three-tier store does not.)*

## 9. Feature tiers (build in this order — do not invert)

| Tier | Must contain | Why |
|------|--------------|-----|
| **EXISTENTIAL** | **W1 runtime provenance verification** | Without it the central claim is false, and it has been *measured* false (3/5 live runs fabricated). Everything else is worth less if this is missing. Ship it before any new feature. |
| **CORE (must work)** | Ingestion → unified view → cost calculator + min-cost flow baseline → one live what-if that recomputes → agents answering with real numbers → goal-driven loop (**reachable**) → MILP recommender w/ greedy fallback | This alone is a winning, honest build. |
| **ACCURACY** | Real road distances + H3 (**wired into `/ingest`**), Monte Carlo confidence bands, reconstructed-baseline labelling, evidence-labelled inputs | Makes the ~5% believable to a logistics judge — and defensible under questioning. |
| **SIGNATURE (pick the demo flexes)** | Agent Builder (2–3 real templates), opportunity scanner, threshold finder, prescriptive unlock, auto decision-brief, **Time Machine (W3)**, **learning twin (W2)** | The "we never thought of that" differentiators. |
| **PLATFORM** | **MCP server (W6)**, closed-loop monitoring (W4) | Proves this is a platform other systems can drive, not a demo app. *(The W5 swarm was cut by decision — see §5.1.)* |
| **STRETCH** | Forecast, SimPy waves, vector search over memory | Upside; cut without hesitation if time is tight. |

**Anti-scope rule (learned the hard way):** a feature is not built until a user can *reach*
it. The audit found three fully-implemented, fully-tested capabilities — the goal loop, H3
zoning, and the Postgres layer — that no user could invoke. Wiring is part of the ticket, not
a follow-up.

## 10. Frontend spec (Next.js + deck.gl)

- **Map** — hubs coloured by utilisation (green→red), ArcLayer flows hub→zone, demand heat.
- **KPI cards** — total cost-to-serve, avg utilisation, % coverage, spare capacity.
- **Scenario panel** — toggle hubs, sliders for demand growth and fleet cost, "Simulate" → before/after diff. **All registered scenario modules must appear** — the panel is generated from `GET /scenarios`, never a hard-coded subset.
- **Agent chat** — ask questions, get computed+explained answers; shows which tool produced each number, **plus a verification badge** (`verified` / `flagged`) from W1. A flagged answer names the untraceable figure inline — we show our own guardrail catching a mistake rather than hiding it.
- **Agent Builder panel** — create/configure agents.
- **Decision-brief view** — the generated one-pager, exportable.
- **Time Machine scrubber (W3)** — a timeline under the map; drag to move through past decisions and forward projections, map re-renders live, dropped flows grey out and new flows highlight.
- **Alert cards (W4)** — pushed by monitoring agents: finding, recommended action, link to the brief.

**Frontend honesty rule:** display only numbers the API returned. No client-side arithmetic
on engine figures — if the UI needs a derived value, the API returns it.

No browser storage APIs; state in React. Distances/heavy compute happen server-side (FastAPI), streamed to the UI.

## 11. KPI & validation strategy

- **Baseline (critical for the 5% claim):** cost-to-serve on the *current* assignment if the sheet has it; else a nearest-hub/status-quo proxy. Optimised cost from the flow/MILP. Improvement = `(C0 − C*) / C0`, reported per emirate and network-wide, **decomposed** by source.
- **Reconstructed-baseline labelling (T-31):** when the baseline is our own nearest-hub proxy rather than EMX's real assignment, it must be labelled a **reconstructed baseline** everywhere it appears — API, UI, and brief — with the explicit statement that it is *not* a description of EMX's actual current practice. Our entire improvement claim is measured against it; a judge will ask what it is, and the answer must already be on screen.
- **Evidence-labelled inputs (T-32):** every engine input parameter carries an evidence status — `verified` (from the dataset/brief, cited), `derived` (computed from a verified figure via a stated formula), or `assumed` (a configurable placeholder). Today `ROAD_FACTOR=1.3`, `AVG_SPEED_KMH=40`, the scanner thresholds and every synthetic cost are unlabelled assumptions scattered across modules. One registry, one status per parameter. This extends the no-fabrication guarantee from *outputs* to *inputs*.
- **Sensitivity:** show the saving holds across demand +10/20/30% (Monte Carlo re-solve).
- **Sanity checks:** flow conservation (in = demand), no capacity violated, coverage ≥ current.
- **80% metric:** a fixed checklist of ~10 canonical planning questions; coverage = answered-automatically / total. Put the checklist on a slide; state clearly it's a proxy.
- **Speed KPI:** "8 hours manual → < N seconds on platform" — measure and show it.

## 12. Pre-build vs event-day plan

**Pre-build now (no dataset needed):**
- Canonical schema + Postgres migrations; ingestion/mapping skeleton against an assumed schema + synthetic EMX-shaped data.
- The three compute layers, tested on synthetic data.
- Plugin registry + contracts; a starter set of plugins (4–5 scenario modules, 2 optimisers, 3 metrics, agent tools).
- LangGraph multi-agent graph + goal-driven loop + Agent Builder (with templates).
- Full frontend shell: map, KPI cards, scenario panel, agent chat, Agent Builder, decision-brief view.
- Road-distance integration + confidence-band utility, on synthetic data.
- One always-renders demo scenario, seeded.

**Event day (24h):**
1. **H0–2:** profile the real Excel, write the column mapping, load canonical tables, build the baseline. Answer the open data questions in `VISION.md §8c`.
2. **H2–6:** calibrate the cost model to real numbers; verify baseline recovers a sane current cost; wire real distances.
3. **H6–14:** run scenarios + optimisation; generate the real recommendations that hit the target; validate (sensitivity, sanity).
4. **H14–20:** point the agents at real data; finalise Agent Builder templates, scanner, threshold finder, decision-brief.
5. **H20–24:** polish, seed the demo scenario, rehearse the pitch and the Q&A (`VISION.md §8b`).

**Rule:** on event day, spend hours on real data + recommendations + demo — **never** on the framework. The framework is done before we arrive.

## 13. Top risks & mitigations

- **Schema surprise** → schema-agnostic ingestion; first 1–2h reserved for mapping.
- **MILP won't solve** → min-cost flow is primary (always solves); MILP is the recommendation layer with a greedy fallback; test the solver install *before* the event.
- **Decorative AI** → agents call real tools from hour zero; enforce the guardrail in code (agents receive tool JSON, never free-type numbers).
- **No baseline = no 5% story** → decide baseline construction before the reveal; have the coverage/speed fallback narrative.
- **Scope creep** (VRP, full DES, forecasting) → tiers in §9; cut from the bottom up.
- **Demo fragility** → one pre-seeded scenario that always renders; never debug live.
