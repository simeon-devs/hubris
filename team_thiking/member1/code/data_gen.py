"""
Data generation layer.
=======================
No operational dataset (shipment history, courier rosters, actual costs)
was supplied alongside the four PDF blueprints, and the PDFs themselves
confirm no EMX-specific volume, workforce or productivity figures are
publicly available (see config.py header and the Evidence & Data Audit
in the report). To make the capacity-conversion engine, optimisation
logic, backtest and KPI framework REPRODUCIBLE and TESTABLE, this module
generates a clearly-labelled SYNTHETIC dataset shaped like what a real
EMX extract would look like (same schema, same granularity, same
plausible ranges implied by generic industry KPI formulas found in the
PDFs). Every value produced here is ASSUMED/SIMULATED, not an EMX fact.
Swap this module for a real data-ingestion pipeline in production —
nothing downstream needs to change, since the engine only depends on
the schema, not on this generator.
"""
import numpy as np
import pandas as pd
from datetime import date, timedelta
import config as cfg

rng = np.random.default_rng(cfg.RANDOM_SEED)

STORES = pd.DataFrame([
    dict(store_id="DXB-01", city="Dubai",        archetype="urban_dense",    base_daily_shipments=620),
    dict(store_id="DXB-02", city="Dubai",        archetype="urban_dense",    base_daily_shipments=540),
    dict(store_id="DXB-03", city="Dubai",        archetype="suburban",       base_daily_shipments=410),
    dict(store_id="DXB-04", city="Dubai",        archetype="industrial_b2b", base_daily_shipments=305),
    dict(store_id="AUH-01", city="Abu Dhabi",    archetype="urban_dense",    base_daily_shipments=480),
    dict(store_id="AUH-02", city="Abu Dhabi",    archetype="suburban",       base_daily_shipments=350),
    dict(store_id="AUH-03", city="Abu Dhabi",    archetype="industrial_b2b", base_daily_shipments=260),
    dict(store_id="SHJ-01", city="Sharjah",      archetype="suburban",       base_daily_shipments=390),
    dict(store_id="SHJ-02", city="Sharjah",      archetype="mixed",          base_daily_shipments=300),
    dict(store_id="AAN-01", city="Al Ain",       archetype="mixed",          base_daily_shipments=190),
    dict(store_id="RAK-01", city="Ras Al Khaimah",archetype="mixed",         base_daily_shipments=175),
    dict(store_id="FUJ-01", city="Fujairah",     archetype="suburban",       base_daily_shipments=150),
])
# NOTE: store count, city mix, and base volumes are ASSUMED for
# demonstration. EMX's actual store/depot network, city footprint and
# volumes are not publicly disclosed (doc2 p.3, p.35, p.41; doc3 p.1).

STORES["service_min"] = STORES["archetype"].map(lambda a: cfg.STORE_ARCHETYPES[a]["service_min"])
STORES["travel_min"] = STORES["archetype"].map(lambda a: cfg.STORE_ARCHETYPES[a]["travel_min"])
STORES["stops_per_hour_cap"] = STORES["archetype"].map(lambda a: cfg.STORE_ARCHETYPES[a]["stops_per_hour_cap"])

# Existing workforce per store (ASSUMED starting point — no real EMX
# roster was available). Sized using the SAME service+travel-time formula
# the engine itself uses (so the baseline gap reflects a genuine, moderate
# planning shortfall rather than an artifact of using an unrelated sizing
# rule), then deliberately under-provisioned by 10-30% and mis-mixed
# relative to the 60/40 target — mirroring the brief's description of a
# network that does not consistently hit its capacity or mix targets today.
_AVAILABILITY_FACTOR = 1 - cfg.REST_DAY_RATIO - cfg.LEAVE_RATE
_PRODUCTIVE_FRACTION = (1 - cfg.BREAK_RATIO - cfg.TRAINING_NONPRODUCTIVE_RATIO) * cfg.UTILISATION_TARGET
_EFFECTIVE_HOURS_PER_HEAD = cfg.SHIFT_HOURS * _AVAILABILITY_FACTOR * _PRODUCTIVE_FRACTION


def _existing_workforce(row, rng):
    true_required_hours_at_base_volume = row.base_daily_shipments * (row.service_min + row.travel_min) / 60.0
    true_required_headcount = true_required_hours_at_base_volume / _EFFECTIVE_HOURS_PER_HEAD
    coverage_ratio = rng.uniform(0.70, 0.90)  # ASSUMED — deliberate 10-30% shortfall vs base-volume requirement
    total = max(3, int(round(true_required_headcount * coverage_ratio)))
    perm_share = rng.uniform(0.45, 0.72)  # deliberately off-target vs the 60/40 policy in places
    perm = int(round(total * perm_share))
    outs = total - perm
    return pd.Series({"existing_permanent": perm, "existing_outsourced": outs})

STORES = STORES.join(STORES.apply(lambda r: _existing_workforce(r, rng), axis=1))
STORES.to_csv(f"{cfg.OUTPUT_DIR}/stores.csv", index=False)


def _campaign_for_date(d: date) -> str:
    # ASSUMED illustrative 2026 campaign calendar (not verified UAE Islamic-calendar dates)
    if date(2026, 2, 17) <= d <= date(2026, 3, 19):
        return "ramadan"
    if date(2026, 3, 20) <= d <= date(2026, 3, 23):
        return "eid"
    if date(2026, 11, 25) <= d <= date(2026, 11, 30):
        return "black_friday"
    if date(2026, 12, 20) <= d <= date(2027, 1, 2):
        return "year_end"
    return "none"


def _daily_volume(store_row, d: date, rng, forecast=False, horizon_days=0):
    dow = d.weekday()  # Mon=0..Sun=6
    is_weekend = dow in (4, 5)  # UAE weekend: Fri=4, Sat=5
    campaign = _campaign_for_date(d)
    trend = 1.0 + 0.0009 * ((d - date(2026, 1, 1)).days)  # ASSUMED mild organic growth trend
    seasonal = cfg.WEEKEND_UPLIFT if is_weekend else 1.0
    seasonal *= cfg.CAMPAIGN_UPLIFT[campaign]
    base = store_row.base_daily_shipments * trend * seasonal
    noise_sd = 0.09 if not forecast else 0.0  # actuals have day-to-day noise; forecast returns the mean
    noise = rng.normal(0, noise_sd)
    return max(0, base * (1 + noise)), campaign, is_weekend


def build_history(start: date, end: date, rng) -> pd.DataFrame:
    """Reconstructed daily ACTUAL shipment volumes per store (for backtesting)."""
    rows = []
    d = start
    while d <= end:
        for _, s in STORES.iterrows():
            vol, campaign, is_weekend = _daily_volume(s, d, rng, forecast=False)
            rows.append(dict(store_id=s.store_id, date=d, actual_shipments=round(vol),
                              campaign=campaign, is_weekend=is_weekend))
        d += timedelta(days=1)
    return pd.DataFrame(rows)


def build_forecast(start: date, horizon_days: int, rng) -> pd.DataFrame:
    """Rolling shipment forecast per store per day, with P50/P80/P95 uncertainty bands."""
    rows = []
    for h in range(horizon_days):
        d = start + timedelta(days=h)
        week_idx = h // 7
        cv = cfg.FORECAST_CV_BASE + cfg.FORECAST_CV_GROWTH_PER_WEEK * week_idx
        for _, s in STORES.iterrows():
            p50, campaign, is_weekend = _daily_volume(s, d, rng, forecast=True)
            sigma = p50 * cv
            p80 = p50 + 0.84 * sigma
            p95 = p50 + 1.645 * sigma
            rows.append(dict(store_id=s.store_id, date=d, horizon_day=h, forecast_p50=round(p50, 1),
                              forecast_p80=round(p80, 1), forecast_p95=round(p95, 1),
                              forecast_cv=round(cv, 4), campaign=campaign, is_weekend=is_weekend))
    return pd.DataFrame(rows)


def build_absence_series(dates, rng):
    """Daily absence-rate realisation per date (ASSUMED, varies around config.LEAVE_RATE+rest)."""
    base = cfg.LEAVE_RATE
    return {d: max(0.0, base + rng.normal(0, 0.015)) for d in dates}


if __name__ == "__main__":
    hist_start = cfg.TODAY - timedelta(weeks=cfg.BACKTEST_HISTORY_WEEKS)
    hist_end = cfg.TODAY - timedelta(days=1)
    history = build_history(hist_start, hist_end, rng)
    history.to_csv(f"{cfg.OUTPUT_DIR}/history_actuals.csv", index=False)

    forecast = build_forecast(cfg.TODAY, cfg.FORECAST_HORIZON_DAYS, rng)
    forecast.to_csv(f"{cfg.OUTPUT_DIR}/forecast_90d.csv", index=False)

    print("Stores:", len(STORES))
    print("History rows:", len(history), "from", hist_start, "to", hist_end)
    print("Forecast rows:", len(forecast), "from", cfg.TODAY, "for", cfg.FORECAST_HORIZON_DAYS, "days")
