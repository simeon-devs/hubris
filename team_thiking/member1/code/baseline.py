"""
Manual Baseline Reconstruction
================================
The brief requires a MEASURABLE, REPRODUCIBLE baseline, not just a
description. No documented manual formula exists in the four PDFs — none
of them describe EMX's current planning method (doc2 p.35/p.41 confirm
workforce/operating-scale data is simply not disclosed at all, internally
or externally). Per the brief's own instruction ("Where no documented
manual formula exists, define a transparent baseline based on the
simplest defensible current-state rule and label it as a reconstructed
baseline"), the baseline below is a RECONSTRUCTED BASELINE, explicitly
labelled as such throughout the report. It is deliberately built to
mirror how manual, spreadsheet-driven workforce planning is generally
described in practice: a single flat network-wide productivity rule
applied to a trailing average of recent volume, with no store-level
productivity differentiation, no hour-level granularity, and no
lead-time-aware hiring trigger (hiring/outsourcing is decided reactively,
at the point of shortage, rather than against a lead-time deadline).
This mirrors the brief's own description of the problem: "Manual
planners estimate the number of couriers required by store, day, and
hour. These decisions do not consistently account for [store
productivity differences, route/service time, shift structure,
shrinkage, hiring lead times, ...]".
"""
import pandas as pd
import numpy as np
import config as cfg

# Single network-wide productivity constant used by the reconstructed
# manual baseline (ASSUMED — this is the "one average productivity
# figure" anti-pattern the brief explicitly asks the engine to avoid;
# it is retained here deliberately so the baseline is comparable and so
# the engine's store-level differentiation can be shown to add value).
NETWORK_FLAT_PARCELS_PER_COURIER_DAY = 55.0
BASELINE_TRAILING_WINDOW_DAYS = 28
BASELINE_FIXED_SHRINKAGE_ALLOWANCE = 0.85  # ASSUMED flat "buffer factor" planners commonly apply, not
                                            # decomposed into leave/rest/break/utilisation components


def trailing_average_volume(history_df: pd.DataFrame, as_of_date, window_days=BASELINE_TRAILING_WINDOW_DAYS) -> pd.DataFrame:
    """Reconstructs what a planner working with a spreadsheet would see: a
    simple trailing average of recent actual daily volume per store, with
    no forward-looking forecast, no seasonality/campaign adjustment, and
    no weekday/weekend split."""
    window_start = as_of_date - pd.Timedelta(days=window_days)
    win = history_df[(history_df["date"] >= window_start) & (history_df["date"] < as_of_date)]
    avg = win.groupby("store_id")["actual_shipments"].mean().reset_index()
    avg = avg.rename(columns={"actual_shipments": "trailing_avg_shipments"})
    return avg


def baseline_required_headcount(trailing_avg_df: pd.DataFrame) -> pd.DataFrame:
    df = trailing_avg_df.copy()
    # flat productivity, flat shrinkage allowance -> no store differentiation, no hour-level view
    df["baseline_required_headcount"] = (
        df["trailing_avg_shipments"] / (NETWORK_FLAT_PARCELS_PER_COURIER_DAY * BASELINE_FIXED_SHRINKAGE_ALLOWANCE)
    )
    return df


def baseline_recommendation(history_df: pd.DataFrame, stores_df: pd.DataFrame, as_of_date) -> pd.DataFrame:
    """Full reconstructed-baseline recommendation for a single planning date."""
    trailing = trailing_average_volume(history_df, as_of_date)
    req = baseline_required_headcount(trailing)
    out = req.merge(stores_df[["store_id", "existing_permanent", "existing_outsourced"]], on="store_id", how="left")
    out["existing_headcount"] = out["existing_permanent"] + out["existing_outsourced"]
    out["baseline_gap"] = out["baseline_required_headcount"] - out["existing_headcount"]
    # Reactive rule: baseline planners react to a shortage the same week it
    # is noticed, filling with whichever outsourced capacity is available;
    # no explicit permanent/outsourced split logic and no lead-time check.
    out["baseline_permanent_reco"] = out["existing_permanent"]  # baseline does not proactively add permanent heads
    out["baseline_outsourced_reco"] = np.where(
        out["baseline_gap"] > 0, out["existing_outsourced"] + np.ceil(out["baseline_gap"]), out["existing_outsourced"]
    )
    out["as_of_date"] = as_of_date
    return out
