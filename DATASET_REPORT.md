# DATASET REPORT — the real event dataset, fully profiled

> `dataset/Dataset_AI-Powered Network Capacity & Cost Intelligence_Final.xlsx` (99 KB, 11 sheets).
> Problem statement **"G — AI-Powered Network Capacity & Cost Intelligence"**, EMX Hackathon 2026.
> Everything below was computed from the file, not read off the sheet labels — discrepancies are called out.
> This is the T-28 pre-brief: what's in it, what it means for our build, what must be decided.

---

## 1. What the organisers are asking for — and how we already match

The dataset's own README defines the ask. It is, almost verbatim, what we built:

| Their words | Our build |
|---|---|
| "**Digital Twin** — a virtual model … run 'what if' simulations" (their KEY CONCEPT, verbatim) | The entire product |
| **A.** Capacity dashboard — utilisation, headroom, SLA risk per hub, on a map | Map + KPI cards + flow-based utilisation (T-16/T-37) |
| **B.** Cost-to-serve analyser — which hubs/zones cost most **and why** | cost_to_serve metric + breakdowns + opportunity scanner (T-07/T-21) |
| **C.** Scenario simulator — "if we open CAND_DXB_01…" | `add_hub`/`close_hub` scenarios + MILP with **candidate** status + brief (T-09/T-10/T-24) |
| **D.** Opportunity assessor — "new client in a zone: can we absorb them? at what cost?" | `find_spare_capacity` + `add_customer` + threshold finder (T-11/T-22) |
| "Judges reward **explainability** — show its reasoning, not just output a number" | The provenance gate, verification badges, `why` strings, assumption registry (T-33/T-21/T-32) |
| "Pick ONE or TWO focus areas … depth beats shallow coverage" | We have depth on all four — the pitch should still LEAD with C+D |

**Baseline metrics we must beat (at least one, on this data):**

| Metric | Baseline | Target | Our angle |
|---|---|---|---|
| Opportunity assessment time | ~8 h | < 30 min | One chat question / one API call — **seconds**. Easiest win, demo it end-to-end |
| Scenario simulation time | 4–8 h | < 5 min | `/simulate` + `/optimize` + brief in < 10 s. Second easiest win |
| Cost per shipment (H&S Std) | "~8.50" (see §5.1!) | ≤ 7.00 | Optimiser consolidation; must first resolve the 8.50-vs-62 definition gap |
| Courier utilisation | 78% | 85%+ | Rebalancing recommendations (scanner idle-next-to-overload) |
| On-time delivery | 85% | 90%+ | Correlate SLA breaches with headroom; recommend capacity moves |
| Hubs "At Risk" | 3 of 10 | 0–1 | Watchdog alerts + bottleneck unlock actions |
| Capacity visibility | manual Excel | real-time dashboard | The app itself |

**"DONE WHEN"** (their acceptance test): ingest the 6 operational sheets, display network capacity+cost status, simulate ≥1 change (e.g. open a candidate hub), improve ≥1 baseline, explain clearly. All five are within what's already built once ingestion (T-28) lands.

---

## 2. The network in the file

Three complementary service networks, **22 operating facilities + 3 candidates**:

- **Hub & Spoke** — 10 active hubs (4 Dubai, 2 Abu Dhabi, 1 each SHJ/RAK/AJM/FUJ), 4 Full + 6 Micro; rent 35k–180k AED/mo; capacity 400–4,000 shipments/day; **710 couriers** in two waves (09–17, 14–22); cars/vans/motorcycles + linehaul trucks. Standard (next-day) + Express (same-day).
- **QComm** — 10 dark stores (7 Dubai, 2 AUH, 1 SHJ), 24/7, **433 bike couriers** in 3 shifts, 15-min target (20 in SHJ), 420–820 orders/day capacity.
- **On-Demand** — Dubai + Abu Dhabi, **47 bike couriers**, 07:00–24:00, 1-hr pickup-to-delivery target (currently 22/28 min average response).
- **3 candidate hubs** for expansion: `CAND_DXB_01` Dubai South (Full, 4,200/day, 170k rent), `CAND_AUH_01` Al Reem (Micro, 1,200/day), `CAND_SHJ_01` Sharjah Airport (Full, 2,500/day). Cleanly absent from every operational sheet — pure simulation subjects.

Totals: 920 vehicles (410k AED/mo fleet cost), 1,190 couriers (2.92M AED/mo labour at ~4.33 wk/mo), FTE 3,200 AED/wk vs FTC 1,800–2,400 AED/wk. **Dictionary note: FTE recruit 45–60 days, FTC 5–10 days** — the same lead-time structure as member1's capacity brief; useful colour for Q&A, not for our scope.

---

## 3. The headline analytical findings (the demo story writes itself)

**3.1 · Q-commerce is saturating while the hub network idles.** Week-13 daily demand vs capacity:
- Dark stores: **87–102% load** — three are OVER capacity: `QED_AUH_02` **102.3%**, `QED_DXB_06` **101.1%**, `QED_AUH_01` **100.8%**; the rest 87–95%.
- Hub & Spoke: **2.2–12.5% load** against `max_daily_shipments` (DXB_01 highest at 12.5%).
- The planning tension in one sentence: *ultrafast demand is bursting its walls while next-day infrastructure sits near-empty — and three candidate hubs are on the table.*

**3.2 · Cost structure: overhead is 70% of everything.** Cost_to_Serve components network-wide: **overhead 70.4%**, labour 19.8%, fuel 6.8%, vehicle 3.0%. Cost/shipment (weighted, fully loaded): H&S **60.11** (range 48–152!), QComm **4.03**, On-Demand **9.01**. The H&S small-hub tail is brutal: FUJ **151.68**, RAK **114.16**, AUH_02 **110.17**, DXB_03 **94.18** — low volume under fixed rent. This is precisely our CFLP's habitat (fixed cost vs transport trade-off), and precisely finding-B ("which hubs cost most and why": *because overhead is amortised over almost no volume*).

**3.3 · Demand is growing 4–20% with clear hot spots.** 13 weeks (2026-04-28 → 07-21), total volume 45.5k → 51.3k/wk (+12.6%, small dip in wk 13). QComm zones grow at a uniform ~14%; **Business Bay Express at 20%** and Standard 18% are the hottest H&S cells. Week-13 volume split: QComm 42,974 / H&S 7,422 / On-Demand 889 per week. `growth_rate_pct` per zone feeds our threshold finder directly ("at what growth does QED_AUH_02 break?" — answer: it already has).

**3.4 · Performance data corroborates: 52 of 286 week-rows are "At Risk".** Network avg courier utilisation 81% (their baseline text says 78%), OTD 87.3% (says 85%). Week-13 At Risk: `HUB_RAK_01` (headroom 6.4%) + `QED_DXB_04`. 17 of 22 facilities have been At Risk in at least one week. Status derives from `capacity_headroom_pct ≈ 100 − courier_utilisation` (±3 max err; <8 At Risk, 8–18 High Load, >18 Normal). **Note the two utilisations**: their headroom is COURIER-based (labour), while `max_daily_shipments` load (§3.1) is PHYSICAL throughput — hubs are simultaneously ~85% courier-busy and ~5% building-utilised. Both are true; our T-37 two-quantities discipline (`utilization_pct` vs `assignment_share_pct`) extends naturally to naming these apart. Never conflate them on a slide.

---

## 4. Sheet-by-sheet profile

| Sheet | Shape | Grain | Keys / joins | Notes |
|---|---|---|---|---|
| README | 26×1 | prose | — | Problem statement, focus areas A–D, key concepts |
| Data_Dictionary | 68×5 | per field | — | See §5.2 — drifts from actual columns in places |
| Baseline_Metrics | 12×4 | per metric | — | The 7 baselines + DONE WHEN |
| Hub_Network | **13×13** | 1 row = hub/candidate | `hub_id` → everything | status Active/Candidate; rent, sqm, max_daily_shipments, service_models, linehaul_trucks, lat/lng |
| Dark_Store_Network | **10×10** | 1 row = dark store | `store_id` | bike_couriers, max_daily_orders, target_delivery_min, lat/lng, 24/7 |
| OnDemand_Network | **2×9** | 1 row = emirate fleet | `od_id` | pseudo-zones "Dubai (all zones)" / "Abu Dhabi (city zones)"; 3 overlapping shifts |
| Fleet_Roster | **52×10** | vehicle type × facility | `hub_or_store_id` | counts, capacity units (Car 35/Van 80/Moto 12/Truck 400/Bike 8), fuel AED/km (0.14–0.42… per type), monthly cost, ownership |
| Courier_Capacity | **76×13** | shift × employment × facility | `hub_or_store_id` | wave/shift patterns, FTE/FTC, `avg_dph` 3.7–9.4, `avg_dpd ≈ dph×hours` (err ≤0.4), weekly costs (identity exact) |
| Demand_by_Zone | **377×10** | week × zone × service model | `serving_hub_or_store_id` | 13 wks × 29 series; weekly_volume, daily_avg (=wk/7, err ≤0.43), growth_rate_pct 4–20 |
| Cost_to_Serve | **27×12** | facility × service model, monthly | `hub_or_store_id` | full component breakdown; `cps = total/shipments` exact (≤0.005); `avg_distance_per_ship_km` 0.8–32 |
| Network_Performance | **286×12** | week × facility | `hub_or_store_id` | 22×13 complete panel; utilisations, OTD, first-attempt, headroom, SLA breaches, status |

**Hygiene: excellent.** Zero nulls (one designed exception below), zero duplicate keys, zero orphan IDs across all five join paths, candidates referenced nowhere operational, all derived-column identities hold to rounding. The only NaNs: `vehicle_utilisation_pct` and `avg_delivery_time_min` are absent for some network types by design (delivery-time present only for QComm/OD; vehicle-util only for H&S).

---

## 5. Discrepancies and traps (know these before a judge does)

**5.1 · The "~8.50 AED" baseline vs the sheet's own 62.22.** Baseline_Metrics claims H&S Standard ≈ 8.50; Cost_to_Serve computes **62.22 weighted** fully loaded. Resolution found in the data: strip the overhead allocation and H&S variable-only cost/shipment = **10.91** (≈ the claim; QComm claim 4.20 vs actual 4.03 ✓, On-Demand 6.80 vs 9.01 ✗ still off). **Decision required (Sims): which definition do we quote when claiming the ≤7.00 target?** Recommendation: report BOTH, labelled ("fully-loaded" vs "variable"), exactly like our T-37 two-quantities discipline — turning their inconsistency into our credibility moment.

**5.2 · Dictionary ≠ actual columns.** The Data_Dictionary describes `avg_capacity_shipments`/`total_fleet_capacity_shipments` (actual: `avg_capacity_units`, no total), `serving_hub_id` (actual: `serving_hub_or_store_id`), a Demand `weekend_volume` column (actual: `growth_rate_pct` instead — the "+25% Fri/Sat" fact survives only as prose), `daily_shipments_avg` in Network_Performance (absent), and dictionary capacity examples that don't match the sheet (Moto 70 vs actual 12). Also Fleet_Roster carries a Data-Dictionary copy-paste error ("Use to place hubs on a map…" as the fuel-cost note). This is normal messy-vendor behaviour — and our fuzzy-mapping pitch line.

**5.3 · Demand vs Cost_to_Serve volumes disagree for H&S.** DXB_01: demand says ~439/day (~13.2k/mo); Cost_to_Serve says 4,800/mo (~160/day) — a ~2.7× gap (network-wide H&S ~1.55×). QComm reconciles within ~10%. **Calibration rule: take VOLUMES from Demand_by_Zone, take COST RATES (per-shipment, component shares) from Cost_to_Serve; never mix absolute totals across the two.**

**5.4 · Zone coordinates don't exist as a column.** Zones are names. Coverage: every H&S and QComm demand zone matches a facility's own `zone` name → inherit facility lat/lng (identical zone names across sheets confirm intent, e.g. Al Quoz hub + dark store share coords). Only the On-Demand pseudo-zones ("All Zones"/"City Zones") lack coords → model On-Demand non-spatially or pin to emirate centroids. Multi-zone hubs exist (DXB_01 serves Al Quoz + Business Bay; Business Bay coords available from QED_DXB_02).

**5.5 · Their utilisation ≠ our utilisation** (§3.4). Courier-hours-busy vs physical-throughput-used. Name both, always.

**5.6 · Baseline-text vs data drift**: text says "3 of 10 hubs At Risk" — the data's week 13 shows 2 (RAK + QED_DXB_04, and one is a dark store); text says courier util 78% — panel average is 81.0%. Quote the data, footnote the text.

---

## 6. Mapping onto our canonical schema (the T-28 plan)

Our fuzzy connector, run cold against the file, behaved exactly as designed: found the hub sheet, mapped most columns, and **halted asking confirmation** on `lon→lng` and `fixed_cost→?`. But column overrides alone can't finish the job — the canonical `zones` table wants one-row-per-zone with coords/demand, while this file's demand is a wk×zone×service time series with name-only zones. **T-28 = one dataset-specific `DataConnector` plugin** (register it; nothing downstream changes — the architecture's whole point), transforming:

| Canonical | Source | Transform |
|---|---|---|
| `hubs` | Hub_Network | `capacity ← max_daily_shipments` (NOT sqm); `fixed_cost ← monthly_rent_aed`; `status`: Active→open, **Candidate→candidate** (our schema already has it — CFLP-ready); `handling_cost ←` (labour+vehicle)/shipment from Cost_to_Serve per hub (~1.5–6 AED, hub-specific, calibrated not assumed) |
| `zones` | Demand_by_Zone (+facility coords) | One row per (emirate, zone): `demand ←` week-13 (or 4-wk avg — decide) daily_avg summed over service models; coords via facility zone-name join (§5.4); `sla_hours`: Standard 24, Express 8, QComm 0.25–0.33, On-Demand 1–2 |
| `fleet_types` | Fleet_Roster | Per vehicle type: capacity units, `cost_per_km ← fuel_cost_per_km_aed`, monthly cost, counts; hub-scoped rows supported |
| `current_assignments` | Demand_by_Zone.serving_hub_or_store_id | **GOLD — real provided assignments** → `baseline_provenance = "provided"`; T-31's label flips honestly, brief caveat disappears |
| `od_matrix` | derived | Haversine×1.3 → OSRM refresh (T-19), **validated against `avg_distance_per_ship_km`** (12–32 km H&S — sanity anchor for our distance model) |

**Structural decision required (Sims): one twin or three?** The three networks have 15× cost-scale differences and separate capacity systems. Recommendation: **primary twin = Hub & Spoke** (10 hubs + 3 candidates — our CFLP/optimizer/brief pipeline fits it perfectly, and it's where scenario C lives), **QComm as the capacity-crisis story** (saturation §3.1 → watchdog alerts, threshold finder, "which dark store breaks first") — either as a second model instance or a scenario view. On-Demand: report-only (2 rows, no spatial zones). Do NOT blend cost pools across networks.

**What our engine gains on this data vs synthetic:** real candidates for open/close, real provided assignments, per-hub calibrated handling costs, a genuine cost-tail story (FUJ 151.68), genuine growth rates for projections, and 13 weeks of history that can seed episodic memory / the Time Machine's past.

---

## 7. Immediate next actions (T-28, in order)

1. **Build `dataset_g` connector plugin** implementing the §6 table (small, deterministic, unit-tested against the real file's known totals: 13 hubs, 22 facilities, wk-13 volumes).
2. **Calibrate + validate (T-29)**: baseline cost-to-serve per hub within tolerance of Cost_to_Serve's `cost_per_shipment_aed` (fully-loaded definition); distances vs `avg_distance_per_ship_km`; utilisation vs §3.1 loads; assumption registry entries move `assumed → verified/derived` where the file now provides truth (fuel AED/km, SLA targets, capacities…).
3. **Re-seed the demo** on real data: scenario C = open `CAND_DXB_01`, opportunity D = new client in Business Bay (the 20%-growth zone), watchdog alert = QED_AUH_02 over capacity, brief = the whole story. Re-run the learning-flow capture on real facts (`hub.QED_AUH_02.demand_growth_break` ≈ already-broken).
4. **Pitch numbers**: 8h→seconds assessment; 4-8h→<10s scenario; cost-tail findings; At-Risk reduction path. State the §5.1 definition split explicitly.

---

*Method: every figure computed from the file (pandas, in-container), all identities checked (cost = components, cps = total/shipments, dpd = dph×hours, daily = weekly/7, headroom ≈ 100−util), joins verified orphan-free, our connector probed cold + with overrides. No application code was modified for this report.*
