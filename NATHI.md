# Nathi — frontend brief

> **2026-08-05 integration note:** your `hubris-main` frontend is now adopted on `main`
> (squashed; your branch stays as the record). Three things changed under you, all
> committed: (1) the verification badge now renders the backend's three states —
> `verified` / `regenerated` ("self-corrected") / `flagged` naming the exact figures;
> (2) alert surfaces read `GET /memory/alerts` (computed watchdog findings — severity,
> unmet demand per zone, verified recommended action, `brief_link`; ack is
> `POST /memory/alerts/{id}/ack`, ids are uuids); (3) the home page's embedded
> cps/weekly/network-volume literals now hydrate from `GET /event/metrics` when live.
> Your `/event/metrics`, `/route-cost`, exports, and both metrics are ported and live
> on main — pull before continuing. New since your fork: `demand_served` KPI,
> `POST /optimize/frontier` (FrontierPanel on /optimize shows the pattern), and the
> boot is the REAL dataset (baseline_provenance "provided", `qcomm_twin` crisis seeded,
> delete-protected 409).

The backend is done through Wave 3. Every API contract below is **frozen** — build against
it with confidence. **The design is yours**: layout, visual language, motion, interaction —
no mockups imposed. This brief only fixes *what* must be visible and *what the data means*.

Protocol: same as everyone — ticket to WIP in `TASKS.md` → build → commit+push (single
author, ticket ID) → REVIEW. `npx tsc --noEmit` and `npm run build` clean before REVIEW.
Stack: `docker compose up -d` → UI :3000, API docs :8000/docs.

## Your tickets, in priority order

**1 · Verification badge** (T-33 UI) — every `/agent/query` response now carries
`verification`: `verified` | `regenerated` | `flagged`. Flagged answers MUST be visibly
marked and name the exact figures (`untraceable_figures`) — we show our guardrail catching
a lie; never render flagged prose as trustworthy. Design the three states however you like.
→ real payload: `examples/flagged-verification-response.json`

**2 · T-36 — ScenarioPanel goes schema-driven.** Build controls from `GET /scenarios`
(`params_schema`), all 6 scenarios. Success test: a 7th scenario appears with zero
frontend changes.

**3 · T-42 — Time Machine.** Scrubber over the map through time. Backward =
`GET /memory/episodes` (real history exists now); forward = **"scenario projections" —
never the word "forecast", anywhere** (label, code, tooltip — review-blocking rule from
Sims). Dropped flows grey out, new flows highlight. Empty-state-first: no episodes →
a calm "no recorded history yet", never an error. Scaffold on mock data if it helps;
the API is live.

**4 · Alert cards** (T-40) — `GET /memory/alerts` (+ `POST /memory/alerts/{id}/ack`,
pause via `POST /monitoring/enabled`). The twin raises these on its own; a card carries a
computed finding, a recommended action with verified savings, and a `brief_link`.
→ real payload: `examples/captured-alert.json`

**5 · Goal loop control** (T-34) — `POST /goal` (use `targets` for the LLM-free path).
Render the **path explored** (one entry per iteration), not just the final answer.

**6 · Upload + H3** (T-35) — there is no upload UI at all yet. `POST /ingest` multipart,
optional `?aggregate_zones_to_h3=true&h3_resolution=N`.

**7 · Learning surfaces** (T-39) — `applied_heuristics` on `/optimize` & `/simulate`
responses (the twin using what it learned — worth showing); `GET /memory/facts`,
`GET /memory/heuristics` (+ retire toggle), `GET /assumptions` ("this rests on N assumed
inputs" is a selling point, not a confession).
→ the whole story: `examples/learned-heuristic-flow.json`

## Hard rules (non-negotiable, everything else is yours)

- **Display only numbers the API returned.** No client-side arithmetic on engine figures —
  if you need a derived value, ask; the API grows it.
- Every memory/monitoring surface degrades gracefully: `available: false` → calm empty
  state, never a broken panel. The demo must never depend on the DB or the LLM being up.
- **The seeded demo is now the REAL data** (2026-08-05): boot loads the event dataset —
  the baseline is the real Hub & Spoke network (13 hubs, `baseline_provenance:
  "provided"`) and the saved-scenarios picker carries `qcomm_twin`, the dark-store
  network in genuine capacity crisis (infeasible flow, unmet Abu Dhabi demand). Render
  that unmet demand prominently — the crisis IS the demo. `demo_surge` no longer exists.
- **New endpoint for you — `POST /optimize/frontier`**: unconstrained optimum vs the
  resilience-constrained one, side by side, labelled, with `resilience_premium` and
  per-hub `volume_share_by_hub`. Body params `min_hubs_per_emirate` /
  `max_hub_volume_share` are live-tweakable (that's a judge-question surface). Present
  the CONSTRAINED side as the recommendation; the unconstrained one as "what the raw
  optimiser says" — never swap those roles. Each point also carries `cost_pools`:
  `variable_only_aed_per_parcel` (the pool their ≤7.00 target is defined on, with
  `variable_vs_target_aed` + `meets_variable_target` precomputed) and
  `fully_loaded_aed_per_parcel`. Show BOTH, labelled — they move in opposite
  directions under consolidation and that contrast is a pitch moment.
  → real payload: `examples/frontier-by-pool.json`
- **`/kpis` now carries TWO coverage-family quantities, both must render labelled**:
  `coverage` = *SLA reachability* (capacity-blind — reads 100% on the crisis twin) and
  `demand_served` = *demand actually served* (99.72% on `qcomm_twin`, with
  `unmet_by_zone` naming the Abu Dhabi shortfall). Never present one as the other —
  side by side they ARE the crisis story.
- Contract friction? Tell Sims — don't work around a frozen API.

The four `examples/*.json` files are real captured responses — design against them, not
against guesses.
