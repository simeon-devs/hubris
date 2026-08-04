"""
EMX Intelligent Capacity Planning — Configuration & Assumption Registry
=========================================================================
Every parameter below is tagged with an evidence status:

  VERIFIED  -> stated directly in the brief or in the four source PDFs
               (document + page cited in the comment)
  DERIVED   -> calculated from a VERIFIED figure using a stated formula
  ASSUMED   -> no EMX-specific or PDF figure exists; a configurable,
               clearly-labelled placeholder is used so the engine can run.
               THESE MUST BE REPLACED WITH REAL EMX DATA BEFORE PRODUCTION USE.

No EMX productivity figure, workforce count, cost, or shift rule exists
in any of the four source PDFs (see Evidence & Data Audit, Section 3, of
the accompanying report — all three EMX-specific documents explicitly
state headcount, courier count, fleet size and productivity are
"Unknown" / not publicly disclosed). Every operational number below is
therefore either taken verbatim from the competition brief (VERIFIED-BRIEF)
or is an ASSUMED placeholder built from general industry logistics
practice described in the PDFs in generic (non-EMX-specific) terms.
"""

from dataclasses import dataclass, field
from datetime import date

# ---------------------------------------------------------------------------
# 1. WORKFORCE-MIX AND LEAD-TIME PARAMETERS
#    Status: VERIFIED-BRIEF (stated directly in the task brief, not in the
#    PDFs — a keyword search of all four PDFs for "60%", "40%", "workforce
#    mix", "lead time" found no EMX-specific figures corroborating these
#    numbers; they are treated here as client-supplied ground truth).
# ---------------------------------------------------------------------------
TARGET_PERMANENT_SHARE = 0.60          # VERIFIED-BRIEF
TARGET_OUTSOURCED_SHARE = 0.40         # VERIFIED-BRIEF
MIX_TOLERANCE = 0.05                   # ASSUMED — operational tolerance band around 60/40

PERMANENT_LEAD_TIME_DAYS_MIN = 45      # VERIFIED-BRIEF
PERMANENT_LEAD_TIME_DAYS_MAX = 60      # VERIFIED-BRIEF
OUTSOURCED_LEAD_TIME_DAYS_MIN = 5      # VERIFIED-BRIEF
OUTSOURCED_LEAD_TIME_DAYS_MAX = 10     # VERIFIED-BRIEF
# Point estimates used in deterministic calculations (midpoint, DERIVED):
PERMANENT_LEAD_TIME_DAYS = (PERMANENT_LEAD_TIME_DAYS_MIN + PERMANENT_LEAD_TIME_DAYS_MAX) / 2   # 52.5
OUTSOURCED_LEAD_TIME_DAYS = (OUTSOURCED_LEAD_TIME_DAYS_MIN + OUTSOURCED_LEAD_TIME_DAYS_MAX) / 2  # 7.5

# Sustained-gap rule: a gap must persist this many consecutive weeks before
# permanent hiring (rather than outsourcing) is triggered. ASSUMED —
# no EMX-specific structural-vs-temporary threshold exists in the PDFs;
# this is a configurable planner-tunable parameter.
STRUCTURAL_GAP_WEEKS_THRESHOLD = 4

# ---------------------------------------------------------------------------
# 2. TARGET KPIs
#    Status: VERIFIED-BRIEF (stated directly in the task brief). These are
#    TARGETS to evaluate progress against, not claims of current performance.
# ---------------------------------------------------------------------------
TARGET_DEMAND_CAPACITY_MATCH_ACCURACY = 0.95   # VERIFIED-BRIEF
TARGET_MISMATCH_REDUCTION = 0.20               # VERIFIED-BRIEF (vs baseline)
TARGET_ON_TIME_DELIVERY = 0.95                 # VERIFIED-BRIEF
TARGET_LABOUR_COST_PER_SHIPMENT_REDUCTION_AED = 0.50  # VERIFIED-BRIEF

# ---------------------------------------------------------------------------
# 3. SHIFT, SHRINKAGE AND UTILISATION PARAMETERS
#    Status: ASSUMED. No EMX shift-length, absence-rate, rest-day or
#    utilisation-target figure appears anywhere in the four PDFs. Values
#    below are configurable placeholders set at plausible UAE last-mile
#    logistics levels purely so the engine is runnable end-to-end; they
#    are NOT EMX facts and must be replaced with real EMX HR/roster data.
# ---------------------------------------------------------------------------
SHIFT_HOURS = 8.0                 # ASSUMED — standard UAE single-shift length
REST_DAY_RATIO = 1 / 7            # ASSUMED — one rest day in seven
LEAVE_RATE = 0.08                 # ASSUMED — annual leave / sick leave, pro-rated daily
BREAK_RATIO = 0.10                # ASSUMED — paid breaks as a share of shift
TRAINING_NONPRODUCTIVE_RATIO = 0.03  # ASSUMED — training/briefing/vehicle-check time
UTILISATION_TARGET = 0.85         # ASSUMED — target productive-time share of remaining hours
UTILISATION_MIN_ACCEPTABLE = 0.70 # ASSUMED — floor before a store is flagged "at risk"
UTILISATION_MAX_ACCEPTABLE = 0.95 # ASSUMED — ceiling before overtime/burnout risk is flagged

# Combined daily headcount availability factor (DERIVED from the above):
AVAILABILITY_FACTOR = (1 - REST_DAY_RATIO - LEAVE_RATE)
# Combined productive-hour fraction of a scheduled shift (DERIVED):
PRODUCTIVE_HOUR_FRACTION = (1 - BREAK_RATIO - TRAINING_NONPRODUCTIVE_RATIO) * UTILISATION_TARGET

# ---------------------------------------------------------------------------
# 4. COST PARAMETERS (AED)
#    Status: ASSUMED. No EMX labour or outsourcing rate is disclosed in the
#    PDFs (doc2, p.35: "Headcount and courier count: Unknown"; no wage or
#    outsourcing-rate figure appears in doc1, doc3 or doc4 either). Placeholder
#    figures are set at illustrative, order-of-magnitude-plausible UAE
#    last-mile courier cost levels for demonstration only.
# ---------------------------------------------------------------------------
PERMANENT_COST_PER_HOUR_AED = 22.0      # ASSUMED — fully loaded (wage + benefits + on-cost)
OUTSOURCED_COST_PER_HOUR_AED = 27.0     # ASSUMED — outsourced/3PL courier hourly rate (typically at a premium for flexibility)
PERMANENT_OVERTIME_MULTIPLIER = 1.5     # ASSUMED — standard overtime premium
EMERGENCY_OUTSOURCED_PREMIUM = 1.35     # ASSUMED — premium paid for <5-day emergency outsourced booking
HIRING_COST_PER_PERMANENT_HEAD_AED = 3500.0  # ASSUMED — recruitment + onboarding cost

# ---------------------------------------------------------------------------
# 5. SERVICE-TIME AND PRODUCTIVITY PARAMETERS (by store archetype)
#    Status: ASSUMED at the parameter-value level. The STRUCTURE (that
#    productivity should vary by store, route density and service time,
#    and should not use a single network-wide average) is VERIFIED —
#    doc1 p.9 lists "Increase capacity utilisation -> Parcels per vehicle,
#    hub and labour hour" as a primary objective, and doc3 p.38 gives the
#    formula "Parcels per labour hour = Completed eligible parcel tasks /
#    paid direct labour hours". The numeric values populating that
#    structure are ASSUMED placeholders since no EMX figure exists.
# ---------------------------------------------------------------------------
STORE_ARCHETYPES = {
    # archetype: (avg_service_time_min, avg_travel_time_per_stop_min, stops_per_hour_ceiling)
    "urban_dense":   dict(service_min=2.6, travel_min=2.0, stops_per_hour_cap=13),
    "suburban":      dict(service_min=3.0, travel_min=3.4, stops_per_hour_cap=9),
    "industrial_b2b":dict(service_min=4.2, travel_min=4.8, stops_per_hour_cap=6.5),
    "mixed":         dict(service_min=3.0, travel_min=3.0, stops_per_hour_cap=10),
}

# Intraday demand shape (share of daily volume by hour), ASSUMED —
# a stylised e-commerce/last-mile curve peaking late morning and late
# afternoon; no EMX hourly profile is published. Hours 8-22 (14h window),
# store operating hours ASSUMED 08:00-22:00.
HOURLY_DEMAND_SHAPE = {
    8: 0.03, 9: 0.05, 10: 0.08, 11: 0.09, 12: 0.08, 13: 0.06, 14: 0.07,
    15: 0.08, 16: 0.09, 17: 0.09, 18: 0.10, 19: 0.09, 20: 0.06, 21: 0.03,
}
assert abs(sum(HOURLY_DEMAND_SHAPE.values()) - 1.0) < 1e-6

WEEKEND_UPLIFT = 1.18       # ASSUMED — Fri/Sat demand uplift typical of UAE weekend retail pattern
                            # (UAE weekend = Friday-Saturday; ASSUMED, not verified per-store)
CAMPAIGN_UPLIFT = {         # ASSUMED — seasonal/campaign multipliers referenced qualitatively
    "ramadan": 1.12,        # in doc1 p.1 ("material seasonal peaks around Ramadan, Eid, Black
    "eid": 1.35,            # Friday and year-end") but not quantified there; multipliers below
    "black_friday": 1.60,   # are ASSUMED planning placeholders.
    "year_end": 1.25,
    "none": 1.0,
}

# ---------------------------------------------------------------------------
# 6. FORECAST-UNCERTAINTY / SCENARIO BANDS
#    Status: STRUCTURE VERIFIED (doc1 p.17: capacity forecasting output
#    should be "Scenario bands, not single-point values"); numeric spread
#    ASSUMED.
# ---------------------------------------------------------------------------
FORECAST_CV_BASE = 0.12     # ASSUMED coefficient of variation for P50 forecast at 1-week horizon
FORECAST_CV_GROWTH_PER_WEEK = 0.015  # ASSUMED — uncertainty widens with horizon

# ---------------------------------------------------------------------------
# 7. RUN PARAMETERS
# ---------------------------------------------------------------------------
TODAY = date(2026, 8, 2)              # VERIFIED — current date supplied to the assistant
FORECAST_HORIZON_DAYS = 90            # VERIFIED-BRIEF — "rolling three-month shipment forecast"
BACKTEST_HISTORY_WEEKS = 26           # ASSUMED — 6 months of history reconstructed for backtesting
RANDOM_SEED = 42

OUTPUT_DIR = "/home/claude/emx_capacity/outputs"
