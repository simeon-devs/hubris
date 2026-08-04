"""
Backtesting / Time-Based Validation
======================================
For every store-day in the reconstructed 26-week history, this module:

  1. Builds a NAIVE SEASONAL FORECAST using only actual volumes strictly
     BEFORE that date (mean of the same weekday over the preceding up to
     4 occurrences). This deliberately does NOT use the internal
     data-generating formula from data_gen.py, so forecast error is
     genuine (not circular) and reflects realistic seasonal-naive
     forecasting performance, including bias during campaign weeks the
     naive method cannot anticipate.
  2. Computes the RECONSTRUCTED MANUAL BASELINE required headcount as of
     that date (trailing 28-day flat-productivity average — baseline.py).
  3. Computes the ENGINE's required headcount using the naive forecast
     and store-level productivity/shrinkage formulas (engine.py).
  4. Computes the TRUE required headcount using the ACTUAL realised
     demand for that date run through the same store-level engine
     formula — this is the ex-post benchmark ("what should have been
     staffed"), used only for evaluation, never fed back into the
     forecast or the baseline.

This is genuine time-based validation: at each evaluation date, only
information dated strictly before that date is used to produce the
forecast and the trailing-average baseline.
"""
import numpy as np
import pandas as pd
from datetime import timedelta
import config as cfg
import engine as eng
import baseline as bl


def naive_seasonal_forecast(history_df: pd.DataFrame, stores, eval_dates, max_lookback_instances=4):
    """For each (store, eval_date), forecast = mean actual_shipments on the
    same weekday over up to `max_lookback_instances` prior occurrences,
    using only rows with date < eval_date."""
    h = history_df.copy()
    h["date"] = pd.to_datetime(h["date"])
    h["dow"] = h["date"].dt.weekday
    rows = []
    for d in eval_dates:
        d = pd.Timestamp(d)
        dow = d.weekday()
        prior = h[(h["date"] < d) & (h["dow"] == dow)].sort_values("date")
        for s in stores:
            s_prior = prior[prior["store_id"] == s].tail(max_lookback_instances)
            if len(s_prior) == 0:
                continue
            fc = s_prior["actual_shipments"].mean()
            rows.append(dict(store_id=s, date=d, forecast_p50=fc, n_obs=len(s_prior)))
    return pd.DataFrame(rows)


def run_backtest(history_df: pd.DataFrame, stores_df: pd.DataFrame, warmup_days=28):
    history_df = history_df.copy()
    history_df["date"] = pd.to_datetime(history_df["date"])
    all_dates = sorted(history_df["date"].unique())
    eval_dates = all_dates[warmup_days:]  # skip warmup so naive forecast has >=some history
    stores = stores_df["store_id"].tolist()

    naive_fc = naive_seasonal_forecast(history_df, stores, eval_dates)

    # --- Engine required headcount, using the naive forecast (no lookahead) ---
    engine_out = eng.run_engine(naive_fc, stores_df, shipments_col="forecast_p50")
    engine_out = engine_out.rename(columns={"required_headcount": "engine_required_headcount"})

    # --- True required headcount, using actual realised demand (ex-post benchmark) ---
    actual_panel = history_df[history_df["date"].isin(eval_dates)][["store_id", "date", "actual_shipments"]]
    true_out = eng.run_engine(actual_panel, stores_df, shipments_col="actual_shipments")
    true_out = true_out.rename(columns={"required_headcount": "true_required_headcount"})

    # --- Reconstructed manual baseline, per evaluation date ---
    baseline_rows = []
    for d in eval_dates:
        b = bl.baseline_recommendation(history_df, stores_df, pd.Timestamp(d))
        b["date"] = d
        baseline_rows.append(b)
    baseline_out = pd.concat(baseline_rows, ignore_index=True)

    merged = engine_out[["store_id", "date", "archetype", "forecast_p50", "engine_required_headcount",
                          "existing_permanent", "existing_outsourced", "effective_hours_per_head"]].merge(
        true_out[["store_id", "date", "actual_shipments", "true_required_headcount"]],
        on=["store_id", "date"], how="inner"
    ).merge(
        baseline_out[["store_id", "date", "trailing_avg_shipments", "baseline_required_headcount"]],
        on=["store_id", "date"], how="inner"
    )

    merged["engine_error"] = merged["engine_required_headcount"] - merged["true_required_headcount"]
    merged["baseline_error"] = merged["baseline_required_headcount"] - merged["true_required_headcount"]
    merged["engine_abs_pct_error"] = (merged["engine_error"].abs() / merged["true_required_headcount"]).clip(upper=5)
    merged["baseline_abs_pct_error"] = (merged["baseline_error"].abs() / merged["true_required_headcount"]).clip(upper=5)

    merged["engine_over_hours"] = (merged["engine_error"].clip(lower=0)) * cfg.SHIFT_HOURS
    merged["engine_under_hours"] = (-merged["engine_error"].clip(upper=0)) * cfg.SHIFT_HOURS
    merged["baseline_over_hours"] = (merged["baseline_error"].clip(lower=0)) * cfg.SHIFT_HOURS
    merged["baseline_under_hours"] = (-merged["baseline_error"].clip(upper=0)) * cfg.SHIFT_HOURS

    merged["dow"] = merged["date"].dt.weekday
    merged["is_weekend"] = merged["dow"].isin([4, 5])
    return merged


def summarise_backtest(merged: pd.DataFrame) -> dict:
    n = len(merged)
    def acc(col):
        return float((1 - merged[col]).clip(lower=0).mean())
    summary = dict(
        n_store_days=n,
        engine_match_accuracy=acc("engine_abs_pct_error"),
        baseline_match_accuracy=acc("baseline_abs_pct_error"),
        engine_mean_abs_pct_error=float(merged["engine_abs_pct_error"].mean()),
        baseline_mean_abs_pct_error=float(merged["baseline_abs_pct_error"].mean()),
        engine_overstaffed_hours=float(merged["engine_over_hours"].sum()),
        engine_understaffed_hours=float(merged["engine_under_hours"].sum()),
        baseline_overstaffed_hours=float(merged["baseline_over_hours"].sum()),
        baseline_understaffed_hours=float(merged["baseline_under_hours"].sum()),
        engine_mismatch_hours=float((merged["engine_over_hours"] + merged["engine_under_hours"]).sum()),
        baseline_mismatch_hours=float((merged["baseline_over_hours"] + merged["baseline_under_hours"]).sum()),
    )
    summary["mismatch_hours_reduction_pct"] = 1 - (summary["engine_mismatch_hours"] / summary["baseline_mismatch_hours"])
    summary["match_accuracy_improvement_pp"] = (summary["engine_match_accuracy"] - summary["baseline_match_accuracy"]) * 100

    # cost per shipment (labour) using config cost rates, comparing engine vs baseline required hours
    total_shipments = merged["actual_shipments"].sum()
    engine_hours = merged["engine_required_headcount"] * cfg.SHIFT_HOURS
    baseline_hours = merged["baseline_required_headcount"] * cfg.SHIFT_HOURS
    engine_cost = (engine_hours * cfg.PERMANENT_COST_PER_HOUR_AED).sum()
    baseline_cost = (baseline_hours * cfg.PERMANENT_COST_PER_HOUR_AED).sum()
    summary["total_shipments_in_backtest"] = float(total_shipments)
    summary["engine_scheduled_labour_cost_aed"] = float(engine_cost)
    summary["baseline_scheduled_labour_cost_aed"] = float(baseline_cost)
    summary["engine_labour_cost_per_shipment_aed"] = float(engine_cost / total_shipments)
    summary["baseline_labour_cost_per_shipment_aed"] = float(baseline_cost / total_shipments)
    summary["scheduled_labour_cost_per_shipment_reduction_aed"] = (
        summary["baseline_labour_cost_per_shipment_aed"] - summary["engine_labour_cost_per_shipment_aed"]
    )

    # Full-coverage cost: prices in the cost of reactively closing
    # understaffed hours via emergency outsourced booking, so both plans
    # are compared on a like-for-like "demand actually covered" basis
    # rather than crediting an under-resourced plan for looking cheap.
    emergency_rate = cfg.OUTSOURCED_COST_PER_HOUR_AED * cfg.EMERGENCY_OUTSOURCED_PREMIUM
    engine_emergency_cost = merged["engine_under_hours"].sum() * emergency_rate
    baseline_emergency_cost = merged["baseline_under_hours"].sum() * emergency_rate
    summary["engine_full_coverage_cost_per_shipment_aed"] = float((engine_cost + engine_emergency_cost) / total_shipments)
    summary["baseline_full_coverage_cost_per_shipment_aed"] = float((baseline_cost + baseline_emergency_cost) / total_shipments)
    summary["full_coverage_cost_per_shipment_reduction_aed"] = (
        summary["baseline_full_coverage_cost_per_shipment_aed"] - summary["engine_full_coverage_cost_per_shipment_aed"]
    )
    return summary


def segment_summary(merged: pd.DataFrame, by: str) -> pd.DataFrame:
    g = merged.groupby(by).apply(lambda x: pd.Series(summarise_backtest(x)), include_groups=False)
    return g.reset_index()
