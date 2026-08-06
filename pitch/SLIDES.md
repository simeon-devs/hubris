# SLIDES — EMX ATLAS (4 presented + 2 appendix for Q&A)

> Rule: slides hold numbers the audience must SEE to believe; the app shows everything else.
> Dark background, one accent color, huge type. No paragraphs on slides — the script speaks, slides anchor.
> **Present slides 1–4 only.** Slides 5–6 are the back pocket: show them WHEN a judge asks
> "what's your stack?" or "how does this become a product?" — having the slide ready IS the answer.

---

## Slide 1 — open on this (title)

**EMX ATLAS**
*Your network. As a working copy. On your real data.*

- **8 hours → 1 second** per planning question
- 3 networks · 13 hubs · 10 dark stores · ~1,190 riders — one screen

*(bottom corner: team name + emx-atlas-app.onrender.com)*

---

## Slide 2 — trust (shown during "Trust first")

**We reproduce your own numbers. Exactly.**

| | Your report | Our engine |
|---|---|---|
| Cost per parcel (variable) | 10.91 | **10.91** |
| Fully loaded | 60.11 | **60.11** |
| QComm | 2.04 | **2.04** |

**And it found this:** 17 orders/day in Abu Dhabi have nowhere to go.
Dark stores at **87–102%** · Hubs at **2–12%**.

---

## Slide 3 — the mechanism: where the AI is allowed, and where it is not

**The maths computes. The AI explains. A checker stands between them and you.**

```
 your question
      │
      ▼
 ① AI picks the calculation        ← LLM (no arithmetic — it chooses tools, nothing else)
      │
      ▼
 ② ENGINE computes                 ← deterministic solvers: flow LP, MILP, real re-solves
      │                               (same family airlines use — zero AI inside)
      ▼
 ③ AI phrases the answer           ← LLM (words only, quoting engine outputs)
      │
      ▼
 ④ VERIFIER checks every number    ← deterministic — each figure traced to a tool result
      │
      ▼
 your screen  (badge: verified / self-corrected / flagged)
```

- The LLM appears **twice** — choosing and phrasing. It **never** touches: the solver,
  the KPIs, the alerts (the watchdogs are pure code on a 5-minute schedule).
- Measured without step ④: an invented figure in **3 of 5 answers**. With it: an invented
  number **cannot reach the screen** — it gets flagged, by name.

---

## Slide 4 — the decision + close (stays up through the end)

**The maths says close 8 hubs. We say close 4.**

- Raw optimum: **−34%** — but 84% of parcels through one building
- Recommended: **−28%** — a hub in every emirate, no hub above 40%
- The price of that safety: **≈2,700 AED/day** — computed, not guessed
- *(and the model rejected its own earlier −44%: that shape couldn't serve same-day)*

Two findings: *the 7 AED target is a routing lever, not a buildings lever* · *contract riders: −25% cost, equal output*

**See it running: https://emx-atlas-app.onrender.com** *(QR code)*

---

# ——— APPENDIX (show only when asked) ———

## Slide 5 — the stack (for "what did you build this with?")

**Every layer has one job. The AI layer is the thinnest.**

| Layer | What | Its one job |
|---|---|---|
| **Engine** | Python · scipy (HiGHS LP) · PuLP/CBC (MILP) · pandas | Every number on every screen |
| **Memory** | Postgres | Episodes, alerts, heuristics — each row carries provenance to the tool run that made it |
| **Agents** | LangGraph + Claude (Anthropic) | Choose tools, phrase answers — nothing else |
| **Guardrail** | Pure-Python verifier | Trace every figure in the prose to a tool result, before the screen |
| **App** | React · TanStack · Leaflet | Formats numbers; computes none |
| **Surface** | FastAPI · MCP · Docker · Render | Register a plugin once → it's in the UI, the chat, and MCP automatically |

- **Plugin registry**: 12 scenarios + metrics + optimizers — a new one needs zero wiring
- **MCP**: the same tools are operable from Claude on your own machine — a platform, not a demo

---

## Slide 6 — roadmap to production (for "how does this become real?")

**We know exactly what's missing — because the twin told us.**

**Now (hackathon, working):** real-dataset twin · 12 what-ifs · optimiser + frontier ·
2 self-running watchdog agents · verified chat · deployed copy judges can open

**Pilot — first quarter:**
- Live feeds replace the workbook (the connector registry + fuzzy column-mapper already ingest arbitrary schemas)
- Real road distances (OSRM) replace straight-line estimates
- Zone geocoding — today zones inherit their facility's coordinates (the file has no zone coords)
- Settle the volume basis our reconciliation exposed: cost sheet vs demand sheet disagree by 1.55× — finance picks the denominator

**Scale — two quarters:**
- Custom monitoring agents join the scheduler (today the two seeded watchdogs self-run; built agents answer on-demand)
- Auth, roles, multi-planner state; an approval workflow from "Adopt" to execution
- Forecast-driven demand from their own weekly panels (13 weeks already ingested)

**Production — year one:**
- Closed loop: the twin proposes → a human approves → the WMS executes, with a full audit trail
- Multi-country networks on the same plugin registry

*(Every pilot item maps to a limitation we can name today — that is how you know the list is real.)*

---

### Build notes (for whoever makes them pretty)
- Slide 2's table is the single most important visual in the deck — give it the whole slide.
- Slide 3's pipeline: keep the ①–④ numbering; the script's 4:00 beat points at ① and ③ ("the AI appears twice").
- Slide 4 stays on screen during Q&A; it contains every number a judge will ask about.
- Slides 5–6 live AFTER the closing slide in the deck file — you never reach them by accident.
- No animations, no charts pulled from the app — the app itself is the chart.
