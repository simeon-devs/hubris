# Assessment — `team_thiking/member1/` (EMX Intelligent Capacity Planning)

> **Reviewer note:** read-only analysis. No Hubris code was changed, and nothing in this
> folder has been imported into the Hubris codebase. See §5 for the explicit non-goal.

---

## ⚠️ TRACK MISMATCH — READ FIRST

**This work targets a different hackathon track from ours.**

| | Our submission (Hubris) | This work (member1) |
|---|---|---|
| **Track** | **Predictive Network Optimisation** | **Intelligent Capacity Planning** |
| **Product** | Network digital twin | Forecast-to-workforce decision engine |
| **Unit of decision** | Where hubs sit; which zone is served by which hub | How many couriers per store/day/hour; permanent vs outsourced; when to start hiring |
| **Core maths** | Capacitated facility location (MILP) + min-cost flow + duals | Capacity-conversion formula chain + MIP allocation of headcount |
| **Decision owner** | Network planner / strategy | Workforce planning lead / HR |
| **Time horizon** | Structural (where to put capacity) | Rolling 90 days (how much labour to staff) |

The two solve genuinely different problems. This teammate's work is a **workforce
capacity-planning engine** — it takes a shipment forecast and converts it into courier
headcount, hiring dates and permanent/outsourced mix. It contains no network-shape,
hub-location, or zone-assignment logic, and Hubris contains no workforce/shift/shrinkage
logic. They are complementary in a product sense but are **submissions to different
tracks and must not be merged** (§5).

Everything below is therefore an assessment of *transferable method and discipline*, not
of code we would adopt.

---

## 1. What it is

The deliverable is a **forecast-to-workforce decision engine** for EMX, built against a
brief on Intelligent Capacity Planning. Its job is to convert a rolling three-month
shipment forecast into four operational decisions: how many productive courier-hours each
store needs, how those hours split between permanent and outsourced capacity, which
shifts to roster, and when recruitment or outsourced booking has to start so it lands in
time. The package contains two PDFs (a ~24-page evidence-based report and a ~19-page
design blueprint), ~1,240 lines of executable Python across nine modules, and eighteen
output CSV/JSON artefacts from a full end-to-end run.

The engine is a **hybrid**, deliberately not a single learned model: a deterministic
seven-step capacity-conversion chain (shipments → workload minutes → productive
courier-hours → shrinkage-adjusted headcount → staffing gap), a rule layer that separates
*structural* demand (persistent across the horizon → justifies permanent hiring) from
*peak* demand (transient → outsource instead), a **mixed-integer program** (PuLP/CBC) that
allocates new heads across the network subject to a soft 60/40 permanent/outsourced band,
and a natural-language explanation layer generated from live model state. Twelve synthetic
stores across four "archetypes" (urban dense, suburban, industrial B2B, mixed) stand in
for a real EMX network.

The single most important thing about this submission is what it *refuses* to do. An
exhaustive evidence review of the four supplied source documents established that **no
EMX-specific productivity, headcount, cost, or shift figure exists in any of them** — all
three EMX-focused documents state these are explicitly undisclosed. Rather than inventing
plausible numbers and presenting derived results as findings, the author declared every
operational parameter in one auditable file (`config.py`), tagged each with an evidence
status (Verified / Derived / Inferred / Assumed / Unknown), generated a schema-faithful
synthetic dataset, and reported all results as *methodology demonstration on clearly
labelled synthetic data* — never as claims about EMX's real network. The headline result
(57.5% reduction in over/understaffed courier-hours versus a reconstructed manual
baseline, +10.4 points of demand-capacity match accuracy) is explicitly framed as a
*relative* improvement of one method over another, which is the only claim the evidence
actually supports.

---

## 2. Track check

**Confirmed: Intelligent Capacity Planning — a different track from ours.**

Evidence:

- The report's own scope line: *"Workforce capacity planning only — forecast-to-staffing
  conversion, permanent/outsourced allocation, hiring decisions, rostering support."*
- The report explicitly records that it *declined* to expand into network/routing
  territory: *"The brief's instruction to stay focused on workforce capacity planning and
  not expand into a general logistics platform is followed throughout; routing, warehouse,
  fleet-maintenance and pricing material from the PDFs is used only where it clarifies a
  capacity-planning input."*
- Its KPI set (demand-capacity match accuracy, over/understaffed store-hours, courier
  utilisation, labour cost per shipment, permanent/outsourced mix, emergency recruitment
  frequency) is a workforce KPI set. Ours is a network KPI set (cost-to-serve, hub
  utilisation, coverage within SLA, spare capacity).

**Hubris is the Predictive Network Optimisation track** (`README.md:3`, `CLAUDE.md:10`) —
a network digital twin that unifies siloed network data, simulates hub/fleet changes
safely, and recommends the optimal network shape. The overlap with this work is
essentially zero at the logic level.

---

## 3. Quality assessment

### Strengths

**Evidence discipline is the standout, and it is genuinely rigorous.** Every numeric
parameter lives in one file, each tagged Verified-Brief / Derived / Assumed with the
document and page cited where a source exists. A 25-row Evidence Register at the end maps
every material claim to a document and page. When no figure exists, the report writes
**Unknown** — including for headline-adjacent KPIs (on-time-delivery risk is marked
Unknown rather than modelled), which is exactly the discipline that survives hostile
questioning.

**The backtest is methodologically sound and non-circular.** Three details matter and all
three are done right: (a) the comparator forecast is a *naive seasonal* method that
deliberately does **not** reuse the synthetic data generator's internal formula, so
forecast error is real rather than an artifact of knowing the answer; (b) at every
evaluation date, only data strictly prior to that date is used — genuine time-based
validation, with a 28-day warm-up so the naive method has history; (c) the "true required
headcount" benchmark is computed from *realised* demand and used **only** for ex-post
scoring, never fed back into either the forecast or the baseline. 1,848 store-days scored.

**The cost result is reported honestly, and this is the most credible thing in the
package.** On a naive "cost of hours scheduled" basis the engine looks *worse* than the
baseline (AED 3.79 vs 3.75/shipment). The report leads with this rather than burying it,
then explains the arithmetic reason — the baseline is chronically understaffed (15,625
understaffed hours vs the engine's 6,520), so a plan that under-resources will always look
cheaper on scheduled cost because it isn't paying for hours it should be scheduling. It
then introduces a **full-coverage cost** metric that prices the understaffed hours at an
emergency-outsourced rate, on which the engine is AED 0.38/shipment cheaper — and states
plainly that this is 76% of the brief's AED 0.50 target, i.e. *not met*. Two other targets
are also reported as not met (95% match accuracy → 90.7%; AED 0.50 → 0.38). A submission
that volunteers its own misses is far more trustworthy than one that doesn't.

**Reproducibility checks out.** I verified the reported figures against the shipped
artefacts rather than taking the PDF at its word:

| Reported in PDF | Shipped artefact | Match |
|---|---|---|
| 57.5% mismatch reduction | `mismatch_hours_reduction_pct: 0.57549` | ✅ |
| 90.7% engine / 80.4% baseline accuracy | `0.90737` / `0.80356` | ✅ |
| +10.4 points | `match_accuracy_improvement_pp: 10.381` | ✅ |
| AED 0.38 full-coverage reduction | `0.38381` | ✅ |
| Engine AED 0.05 *worse* on scheduled cost | `-0.04646` | ✅ |
| 64.8% realised permanent share | `0.64754` | ✅ |
| Network totals 49 gap / 35 perm / 14 outsourced | summed from `store_hiring_recommendations.csv` | ✅ |

Every number I checked traces to executed output. Nothing was hand-calculated or
massaged.

**Other genuine strengths:** the reconstructed baseline is explicitly labelled as a
reconstruction and deliberately built to be *faithful* rather than a straw-man (the
rationale for each simplification is given); segment-level results show where the engine
helps most **and least**, and name the three worst remaining stores rather than
concealing them; the 60/40 mix is enforced as a *soft* constraint with the realised ratio
recomputed post-solve so drift is visible; explanations are generated from live model
state rather than templates; and Section 13.5 ("What the backtest does *not* prove") and
Section 19's "where this submission is intentionally incomplete" pre-empt the obvious
critiques instead of waiting for a reviewer to find them.

### Weaknesses

**Every operational number is a placeholder — and that ceilings the work.** The report
says so itself, repeatedly and up front, which is to its credit. But the consequence is
real: no absolute figure in the package (headcount, cost, AED/shipment) is an EMX fact,
and the business case cannot be made until Phase 1 of the pilot plan substitutes real
data. The *relative* method comparison survives; nothing else does.

**The peak/structural split is effectively non-functional on this dataset — a materially
bigger problem than the report's framing suggests.** I checked the raw values: every
store's `peak_gap` falls between **0.097 and 0.288** head-equivalents, and every single one
`ceil()`s to exactly **1**. So the "12 recommended outsourced peak heads" is a rounding
artifact of twelve tiny fractions, not detected demand volatility. The report does flag
this (Section 9.1, "disclosed limitation") and correctly diagnoses the cause — the forward
forecast is a smooth deterministic curve with no day-to-day noise, so a week-averaged
point forecast has almost nothing to be volatile about. But one of the engine's two core
decision branches is essentially inert here, and the honest headline would be "the
peak-detection path is untested" rather than presenting 12 peak recommendations in the
output table.

**Some of the measured improvement is structurally circular.** The synthetic generator and
the engine were written by the same author, and the generator *creates* the archetype
productivity differences that the engine then "discovers." The +24.4pt gain on
industrial/B2B stores and +21.4pt on urban-dense is therefore partly a measurement of
"the engine models the thing the data generator put there," not purely a finding about
real store heterogeneity. The naive-forecast firewall correctly prevents circularity in
the *forecast*, but not in the *productivity structure*. The report gestures at this
("robust to this because they compare two methods") without fully conceding the point.

**The baseline is defensible but soft.** A flat 55 parcels/courier/day with no
weekday/weekend split, no seasonality, and no forecast at all, pitted against an engine
with archetype differentiation on data engineered to have strong archetype differences, is
a comparison the engine was fairly likely to win. The author argues — reasonably, with a
brief citation — that this mirrors real spreadsheet planning. It is a fair reconstruction;
it is not a demanding one.

**Engineering hygiene is the weakest dimension.** `config.py:153` hardcodes
`OUTPUT_DIR = "/home/claude/emx_capacity/outputs"`, an absolute path from the authoring
sandbox that will fail on any other machine. There is **no `requirements.txt`** and no
pinned versions, despite depending on PuLP, pandas and NumPy — and `include_groups=False`
(used in three places) silently requires **pandas ≥ 2.2**. There are **no tests** of any
kind: for a package whose entire claim rests on a formula chain being right, the absence
of even one hand-checked fixture asserting that (say) 4.60 effective hours/head falls out
of the stated shrinkage parameters is a real gap. The "fully executed, reproducible" claim
is true of the run that happened, but the package is not currently reproducible by a third
party without edits.

**Smaller items:** the hourly breakdown applies one stylised intraday curve uniformly to
every store-day, which the report itself names as the weakest-evidenced component; the MIP
mix constraint uses a disclosed linearisation approximation; three of twelve stores are
assigned outsourced-only coverage for a *persistent structural* gap, which carries repeat
5–10 day booking risk (flagged, but operationally odd); and "0 store-closure risks
flagged" is carefully worded but is the kind of line a skim-reader could misread as a
positive finding.

**Net judgment:** methodologically strong, intellectually honest to an unusual degree,
and engineering-thin. The reasoning quality is well above the code quality. As a
*blueprint plus proof-of-concept* it is convincing; as a *deployable artefact* it is not
yet, and it says so.

---

## 4. Transferable patterns for Hubris

Method and discipline only — **no capacity-planning logic**. Ordered by value to us.

| # | Pattern from member1 | How it maps onto Hubris |
|---|---|---|
| 1 | **Evidence-labelling every input parameter** (Verified / Derived / Assumed / Unknown) in one auditable config file | Our no-fabrication rule governs agent *outputs* but says nothing about our *inputs*. `ROAD_FACTOR = 1.3`, `AVG_SPEED_KMH = 40`, `PRIMARY_COST_RATIO = 1.15`, `MIN_EXCESS_COST_PER_UNIT = 1.0`, `HIGH_UTILIZATION_RATIO = 1.5`, the demo surge factor, and every synthetic cost figure are unlabelled assumptions scattered across modules. A single `assumptions.py` registry with the same tagging would extend our guardrail end-to-end — highest-value item here, and directly de-risks **T-28** (real dataset day). |
| 2 | **Explicitly distinguishing near-identical computed concepts** (their §6.2 names five separate "capacity" quantities and the exact function computing each) | This is precisely the discipline that would have caught our live **assignment-based vs flow-based utilisation** ambiguity — the artifact making H5 read "107.7% utilised" when the flow says exactly 100%. Naming and separating the two quantities in `contracts.py` would close it. |
| 3 | **Full-coverage costing** — pricing unserved demand so an under-resourced plan can't look cheap | Direct hit. Our `cost_to_serve` counts only *served* demand, so a scenario with unmet demand looks artificially cheap. We surface `feasible`/`unmet_demand` but never price the shortfall. Adding an unmet-demand-priced comparison would stop an infeasible scenario ever appearing to win on cost. |
| 4 | **Labelling the baseline a "reconstructed baseline"** and stating plainly it is not a claim about current practice | Our entire ~5% story is measured against `build_nearest_hub_baseline` (nearest-open-hub-with-capacity), which we invented. Calling it a reconstructed baseline in the pitch — and saying explicitly that it is not a description of EMX's actual planning — removes the single most obvious judge attack on our headline number. |
| 5 | **Reporting targets not met beside targets exceeded** | We claim ~5% cost-to-serve reduction. State in the brief/pitch which targets are met, which are directional, and which are unmeasurable without real data — the same table shape they used. |
| 6 | **Segment-level "where it helps most and least" + naming worst remaining cases** | Break our optimiser's improvement down per emirate / per hub archetype, and have the opportunity scanner report *least-improved* alongside best. We already compute per-emirate breakdowns, so this is presentation, not new maths. |
| 7 | **No-lookahead discipline for any time-based comparison** | Not yet load-bearing for us (we are single-period), but it becomes mandatory the moment T-25 (demand forecast) is picked up. Worth banking the rule now: any comparator must use only information available at decision time. |
| 8 | **One-driver-at-a-time scenario table, isolating volume from efficiency effects** | Their cost/shipment stays flat under pure volume scenarios and rises only under productivity/absence loss — a built-in sanity check that the model responds to the right things. Our scenario suite could assert the analogous invariant as a test (e.g. scaling all demand must not change cost-*per-parcel* if nothing else moves). |
| 9 | **A "what this does NOT prove" section** | One short section in `README.md`/pitch stating the boundaries of the synthetic-data results, before a judge asks. |
| 10 | **Evidence register as a closing appendix** | A compact claim → source table for our pitch deck; cheap to produce, disproportionately credible. |
| 11 | **Explanations generated from live model state, not templates** | Convergent validation — we already do exactly this in the opportunity scanner's `why` strings and the decision brief's `summary`. No change needed; worth noting two independent efforts landed on the same pattern. |

**Not transferable:** the forecast→hours conversion chain, shrinkage/availability
modelling, permanent-vs-outsourced MIP, hiring-date logic, store archetypes, and every
workforce KPI. All of it is capacity-planning domain logic and belongs to the other track.

---

## 5. Explicit non-goal — do not merge the capacity engine

**The capacity-planning engine must not be merged into Hubris.** This is a hard boundary,
not a preference:

1. **Different track.** Hubris is submitted to Predictive Network Optimisation. Importing
   a workforce capacity-planning engine would blur the submission's identity against the
   track it is actually judged on.
2. **Different problem domain.** Our decision variables are hub open/close and zone→hub
   assignment. Theirs are courier headcount, shift rostering and hiring timing. Nothing in
   their engine answers a network-shape question, and nothing in ours answers a staffing
   question.
3. **Scope-dilution risk.** `CLAUDE.md §3` fixes the priority order — engine that computes,
   then agents that call it, then features, then accuracy, then polish — and `§8` warns
   against features that don't clear the "a planner would find this genuinely useful *for
   this product*" bar. A staffing engine bolted onto a network twin would consume Phase 6/7
   time on a capability no judging criterion for our track rewards.
4. **Assumption contamination.** Their engine is, by the author's own account, built
   entirely on placeholder parameters. Importing it would inject a large surface of
   unlabelled assumptions into a codebase whose central claim is that every number is
   engine-computed and traceable.

Adopt the **discipline** from §4. Leave the **engine** where it is.

---

*Assessed 2026-08-04. Source material read in full: both PDFs, all 9 Python modules
(1,238 lines), and all 18 result artefacts. Reported figures independently verified
against shipped CSV/JSON output. No Hubris code was modified.*
