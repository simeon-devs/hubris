# EVENT_DAY_RUNBOOK — 5–6 Aug 2026

> The dataset (`Dataset_AI-Powered Network Capacity & Cost Intelligence_Final.xlsx`)
> unlocks at kickoff. This is the exact sequence from unlock to a live demo on real data.
> Owner column: assign names at kickoff. Timebox: first 2 hours decide everything.

## T+0:00 — Boot & baseline (15 min)

1. `docker compose up -d` (or backend `uvicorn` + frontend `npm run dev` if compose is slow).
2. Paste `ANTHROPIC_API_KEY` into `.env`; confirm `frontend/.env.local` has the TomTom key.
3. Open http://localhost:3000 — synthetic twin must render. If TomTom fails on venue Wi-Fi, check the key's domain restrictions.
4. Smoke test: one Build → Add Customer round-trip, one agent question, VERIFIED badge visible.

## T+0:15 — First look at the real file (20 min)

Open the xlsx and answer the §8c questions from VISION.md, in order:

- [ ] Sheet names → which map to hubs / zones / fleet_types / od_matrix / current_assignments?
- [ ] Coordinates present, or only region names? (No coords → geocode a lookup table for emirates/areas fast; ~30 named places max.)
- [ ] Current zone→hub assignment present? (No → the engine reconstructs nearest-hub status quo automatically.)
- [ ] Time series or snapshot? (Snapshot → skip forecasting talk; time series → mention as roadmap.)
- [ ] Scale: hubs × zones. (≤25 hubs → MILP exact; more → greedy fallback still fine, say so honestly.)
- [ ] Explicit cost columns, or derive from distance × rate + handling (engine's default)?

## T+0:35 — Ingest (30 min, the critical path)

1. UI → **Load 7X dataset** → upload.
2. If the mapping dialog appears (ambiguous columns): confirm each field against the real sheet headers. This is the fire-drill path we rehearsed on `messy_7x_data.xlsx` — do not hand-edit code.
3. Sanity-check the twin against reality: hub count, total demand, an OD spot-check, cost-to-serve plausibility (AED single digits per parcel is sane; 0.02 or 900 is a mapping error — recheck the confirmed columns).
4. **Click "↻ Distances"** to switch to real OSRM road distances; confirm the badge flips to REAL ROADS. (If venue network blocks OSRM, the HAVERSINE badge stays — that's fine, it's the honesty feature.)
5. Save a snapshot: duplicate the xlsx into `backend/data/` and commit.

## T+1:05 — Recompute the story on real data (45 min)

- [ ] Run the optimizer on the real baseline → note the real achievable % saving. **This number replaces every rehearsed one in the pitch.**
- [ ] Run the opportunity scanner → pick the 2 most demo-worthy findings.
- [ ] Threshold finder on the busiest hub → note the growth % where it breaks.
- [ ] Bottleneck unlock → note hub + verified savings.
- [ ] Choose the two SimCity beats: which customer location to add, which hub to move (pick ones where the engine's answer is visually obvious).
- [ ] Update DEMO_SCRIPT.md numbers; rehearse once end-to-end on real data.

## If the saving is small (network already near-optimal)

Pivot the headline (rehearsed in VISION §8b): decision speed (8h → seconds), capacity headroom to absorb growth (threshold finder), and coverage/SLA insight. Do NOT claim 5% the data doesn't support — the judges have the same data.

## Fallbacks

| Failure | Response |
|---|---|
| Dataset wildly different from canonical schema | `column_overrides` in the mapping dialog first; if a whole TABLE is missing, the engine derives od_matrix + assignments automatically — proceed |
| No coordinates at all | Emirate-centroid geocode table (30 min max), zones at centroids with jitter; say so honestly |
| Venue blocks Anthropic API | Demo runs fully without agents (engine computes everything); present the VERIFIED badge on localhost screenshots |
| Venue blocks OSRM | HAVERSINE badge — the honesty story |
| TomTom quota/domain issue | Map shows the graceful error card; fix key settings, else switch style to `basic_main` light |
| MILP slow on big instance | It self-falls-back to greedy under its time limit — nothing to do, mention honestly if asked |

## Submission checklist (by 09:00, 06 Aug)

- [ ] Live demo link reachable (deploy or tunnel — decide by T+12h, don't leave it to the morning)
- [ ] Repo pushed, README current
- [ ] Presentation deck: problem → live demo → architecture (one slide) → viability (one slide)
- [ ] `pytest` green; screenshot of the run in the repo
- [ ] Team rehearsed DEMO_SCRIPT twice on real data
