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

**5.1 Multi-agent workforce** — specialist agents mirroring EMX roles:
- **Network Analyst** — reads current state, finds bottlenecks.
- **Scenario Strategist** — proposes what-ifs.
- **Optimizer** — drives the solver.
- **Cost Analyst** — cost-to-serve decomposition, shadow prices.
- **Risk / Devil's Advocate** — stress-tests recommendations (demand +30%).

**5.2 Agent Builder (no-code)** — a planner defines a new agent: name, plain-English goal, allowed tools (from the registry), autonomy (on-demand vs monitoring). It registers and works immediately. This is the signature "customisation" feature and the live-demo highlight.

**5.3 Goal-driven optimisation loop** — an agent takes a natural-language objective ("cut cost 5%, no hub over 90%") and autonomously runs simulate → optimise → evaluate until satisfied, returning the answer **plus the path explored**. The optimiser is the agent's tool, not the whole show.

## 6. Operator-useful features (the "we never thought of that" tier)

All ride the same engine + loop machinery, so they're cheap together:

- **Opportunity scanner** — proactively surfaces inefficiencies nobody queried (overlapping coverage, demand served from a far hub, idle capacity next to overload).
- **Threshold / break-even finder** — "at what demand growth does Hub B need expanding? how many customers before SLA breaks?" Drives the loop to find the tipping point.
- **Prescriptive bottleneck unlock** — turns the LP duals into "the cheapest way to unblock is +N units at Hub B, costing X, unlocking Y."
- **Auto decision-brief** — generates the one-page leadership business case (current state, change, cost/risk, what it unblocks, sensitivity).

## 7. Accuracy backbone

- **Real road distances** — OSRM/Valhalla (self-hosted) or OpenRouteService for drive-time matrices; **H3** hex grid to aggregate messy demand into clean zones. Makes the numbers trustworthy vs everyone else's straight-line haversine. *(Fallback: haversine × ~1.3 road factor if road engine setup is at risk.)*
- **Monte Carlo confidence bands** — every recommendation ships with a robustness range ("holds under demand ±20% at 95%"). Pure NumPy.

## 8. Stretch (only if core is solid)

- **Demand forecast** (Prophet/statsmodels) — twin projects forward; scanner pre-empts problems.
- **Institutional memory** (Qdrant) — recalls past scenarios and decision rationale semantically.
- **SimPy waves** — throughput/queueing for the two-wave question.

## 9. Feature tiers (build in this order — do not invert)

| Tier | Must contain | Why |
|------|--------------|-----|
| **CORE (must work)** | Ingestion → unified view → cost calculator + min-cost flow baseline → one live what-if that recomputes → multi-agent workforce answering with real numbers → goal-driven loop → MILP recommender w/ greedy fallback | This alone is a winning, honest build. |
| **ACCURACY** | Real road distances + H3, Monte Carlo confidence bands | Makes the ~5% believable to a logistics judge. |
| **SIGNATURE (pick the demo flexes)** | Agent Builder (2–3 real templates), opportunity scanner, threshold finder, prescriptive unlock, auto decision-brief | The "we never thought of that" differentiators. |
| **STRETCH** | Forecast, Qdrant memory, SimPy waves | Upside; cut without hesitation if time is tight. |

## 10. Frontend spec (Next.js + deck.gl)

- **Map** — hubs coloured by utilisation (green→red), ArcLayer flows hub→zone, demand heat.
- **KPI cards** — total cost-to-serve, avg utilisation, % coverage, % of decisions answerable on-platform.
- **Scenario panel** — toggle hubs, sliders for demand growth and fleet cost, "Simulate" → before/after diff.
- **Agent chat** — ask questions, get computed+explained answers; shows which tool produced each number.
- **Agent Builder panel** — create/configure agents.
- **Decision-brief view** — the generated one-pager, exportable.

No browser storage APIs; state in React. Distances/heavy compute happen server-side (FastAPI), streamed to the UI.

## 11. KPI & validation strategy

- **Baseline (critical for the 5% claim):** cost-to-serve on the *current* assignment if the sheet has it; else a nearest-hub/status-quo proxy. Optimised cost from the flow/MILP. Improvement = `(C0 − C*) / C0`, reported per emirate and network-wide, **decomposed** by source.
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
