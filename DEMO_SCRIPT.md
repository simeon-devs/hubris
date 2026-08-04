# DEMO_SCRIPT — EMX ATLAS, the 6-minute winning demo

> Presentation: 06 Aug 2026, 10:00. Rehearse this out loud at least twice.
> Rule of the demo: **never explain the UI — use it.** The judges must understand by watching.

---

## The narrative spine (memorize these 5 sentences)

1. "Today, one planning question at EMX takes **8 hours** of manual work across siloed systems — and the strategic questions never get asked at all."
2. "This is **ATLAS**: EMX's whole network, live, in one view — and you can **touch it**."
3. "Every change you try is re-solved by a real optimisation engine — facility location MILP, min-cost flow with shadow prices, Monte Carlo stress bands — in about a second."
4. "The AI here is not decorative, and we can prove it: **every figure it speaks is machine-verified against the engine**, live, on every answer."
5. "That's the brief's two targets on screen: decisions in seconds instead of 8 hours, and an engine-verified path to the **−5% cost-to-serve** goal."

## Minute-by-minute

**0:00 — The problem (30s).** One slide: "8 hours per question. One network, no single view." Then straight to the live app. No architecture slides yet.

**0:30 — The reveal (30s).** Full-screen dark twin: pillars, animated corridors. Click one hub — the tooltip shows engine numbers (couriers required, utilization, cost-to-serve). Say sentence 2.

**1:00 — SimCity beat #1: absorb a customer (60s).** BUILD → Add Customer → click somewhere ambitious (e.g. inland Sharjah) → confirm card, keep defaults → "Run in the twin". Canvas splits BASELINE | SIMULATION, cameras locked. Read the Before/After deltas out loud from the panel — *"the engine says yes, we can absorb it, and here is exactly what it does to cost."* Adopt it → point at the **Kaizen ledger** ticking at the bottom.

**2:00 — SimCity beat #2: move a hub (60s).** BUILD → Move Hub → click the hub the optimizer dislikes → click a better location. Split view again; corridors visibly re-route. *"This question — 'should we relocate this facility?' — is the one that never gets asked today. Here it's ten seconds, reversible, and quantified."*

**3:00 — The AI, proven honest (60s).** Agent chat: ask "Where is the cheapest capacity unlock, and how much does it save?" The optimizer/bottleneck tools run; answer appears with the **✓ VERIFIED badge**. Expand a tool trace: *"this badge isn't branding — after every answer, the platform re-checks each number in the prose against the engine's actual outputs. If the model ever invents a figure, it's forced to correct itself, and if it still can't, you get an explicit warning instead of a confident lie."* (If a judge is skeptical, this is your moment: no other team can make this claim.)

**4:00 — The autonomous layer (45s).** Point at an **andon alert** raised by the capacity watchdog after your earlier edits: *"agents monitor every change automatically — but jidoka-style: the AI stops and asks, a human acknowledges. Nothing silently acts on the network."* Then the Insights tab: opportunity scanner findings with plain-language 'why', threshold finder ("at what growth does this hub break?"), bottleneck unlock with savings **verified by re-solving, not extrapolated from the dual**.

**4:45 — The event-day proof (45s).** Header → **Load 7X dataset** → upload the real xlsx (rehearsed in the morning). Watch the twin re-light with EMX's actual network. *"Schema-agnostic ingestion — fuzzy plus LLM column mapping with a human-confirm fallback. This is your data, not our synthetic demo."* Run the optimizer on it; read the robustness band: *"holds under ±20% demand in N% of 50 trials."*

**5:30 — Close (30s).** Decision Brief tab → export. *"The 8-hour question is now a one-page, engine-backed business case. ATLAS is a platform 7X could pilot: API-first, every capability a plugin, every number provable. We built the twin the brief asked for — and made it honest."*

## Beats to protect

- **Never skip the VERIFIED badge explanation** — AI Implementation Quality is 25% and this is the answer to "is the AI decorative?".
- **Adopt at least two things** so the Kaizen ledger moves during the demo.
- If OSRM is unreachable, the distance badge says HAVERSINE — *own it*: "the badge is our honesty policy; estimates are labeled estimates."
- If the live agent misbehaves, the amber ⚠ badge IS the feature — "the guardrail caught it in front of you; the engine numbers in the trace below remain authoritative."

## Judge Q&A — the hard five

**"Is the AI doing real work?"** The LLM never computes: it picks tools, sequences them, explains results. The engine (HiGHS LP, CBC MILP, NumPy Monte Carlo) computes. The provenance checker proves the separation at runtime, per answer.

**"Where does the 5% come from?"** The delta between current cost-to-serve and the optimizer's recommended shape, decomposed into line-haul vs fixed vs handling. If EMX's real network is near-optimal, the honest headline shifts to decision speed (8h → seconds) and the capacity-headroom insights — we don't oversell a fixed number.

**"What does 80% of decisions mean?"** The brief's canonical planner questions (absorb a customer? spare capacity? move/close/add? fleet mix? growth threshold?) all answerable in-platform — we demo each in seconds.

**"Could EMX pilot this?"** API-first, plugin architecture, schema-agnostic ingestion already proven on a messy fire-drill workbook, human-in-the-loop governance (jidoka), Docker deploy. The pilot path is data connectors, not a rebuild.

**"What's novel vs anyLogistix/Coupa?"** Those are specialist tools operated by consultants. ATLAS is a control tower a non-specialist drives: direct manipulation on the map, plain-English agents, runtime-verified answers, and an extensible agent workforce — at a fraction of the complexity.
