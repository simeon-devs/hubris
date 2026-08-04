import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import config as cfg
import data_gen as dg
import engine as eng
import baseline as bl
import optimize as opt
import backtest as bt
import scenarios as sc
import explain as ex

OUT = cfg.OUTPUT_DIR


def main():
    print("=" * 70)
    print("EMX INTELLIGENT CAPACITY PLANNING — PROTOTYPE RUN")
    print("=" * 70)

    stores = dg.STORES
    history = pd.read_csv(f"{OUT}/history_actuals.csv", parse_dates=["date"])
    forecast = pd.read_csv(f"{OUT}/forecast_90d.csv", parse_dates=["date"])
    print(f"\nStores: {len(stores)} | History: {history['date'].min().date()} to {history['date'].max().date()} "
          f"({history['date'].nunique()} days) | Forecast horizon: {forecast['date'].min().date()} to "
          f"{forecast['date'].max().date()} ({forecast['date'].nunique()} days)")

    # ---------------- 1. Forward-looking capacity plan (Steps 1-7) ----------------
    engine_daily = eng.run_engine(forecast, stores, shipments_col="forecast_p50")
    engine_daily.to_csv(f"{OUT}/engine_daily_capacity_plan.csv", index=False)
    hourly = eng.hourly_breakdown(engine_daily[engine_daily["date"] < engine_daily["date"].min() + pd.Timedelta(days=7)])
    hourly.to_csv(f"{OUT}/engine_hourly_capacity_plan_week1_sample.csv", index=False)

    network_avg_required = engine_daily.groupby("store_id")["required_headcount"].mean().sum()
    network_existing = stores[["existing_permanent", "existing_outsourced"]].sum().sum()
    print(f"\n--- Forward 90-day plan (network) ---")
    print(f"Network avg daily required headcount: {network_avg_required:.1f}")
    print(f"Network existing headcount (permanent+outsourced): {network_existing:.0f}")
    print(f"Network avg daily gap: {network_avg_required - network_existing:.1f}")

    # ---------------- 2. Structural vs peak classification + optimisation ----------------
    req = opt.build_store_requirements(engine_daily, stores)
    result, meta = opt.optimise_permanent_outsourced_mix(req)
    result = opt.hiring_and_outsourcing_dates(result, cfg.TODAY)
    result.to_csv(f"{OUT}/store_hiring_recommendations.csv", index=False)
    with open(f"{OUT}/optimisation_meta.json", "w") as f:
        json.dump({k: (float(v) if isinstance(v, (int, float, np.floating)) else v) for k, v in meta.items()}, f, indent=2)

    print(f"\n--- Permanent/outsourced optimisation (structural gaps only) ---")
    print(f"Solver status: {meta['status']}")
    print(f"Total recommended new permanent: {result['recommended_permanent_add'].sum()}")
    print(f"Total recommended new outsourced (structural): {result['recommended_outsourced_add'].sum()}")
    print(f"Total recommended outsourced (peak/temporary): {result['peak_gap_int'].sum()}")
    print(f"Realised network permanent share after recommendations: {meta['realised_permanent_share']:.3f} "
          f"(target {cfg.TARGET_PERMANENT_SHARE:.2f} +/- {cfg.MIX_TOLERANCE:.2f})")
    print(f"Mix soft-constraint slack (hi/lo): {meta['mix_slack_hi']:.2f} / {meta['mix_slack_lo']:.2f}")
    print(f"Total annualised cost of recommended additions: AED {meta['total_cost_aed']:,.0f}")

    # ---------------- 3. Explanations for 3 example stores ----------------
    print(f"\n--- Example explanations ---")
    explanations = {}
    for sid in ["DXB-01", "DXB-04", "AAN-01"]:
        row = result[result["store_id"] == sid].iloc[0]
        text = ex.explain_store(sid, engine_daily, row, row)
        explanations[sid] = text
        print(f"\n[{sid}] {text}")
    with open(f"{OUT}/example_explanations.json", "w") as f:
        json.dump(explanations, f, indent=2)

    # ---------------- 4. Backtest ----------------
    print(f"\n--- Backtest (time-based validation, {cfg.BACKTEST_HISTORY_WEEKS} weeks history) ---")
    merged = bt.run_backtest(history, stores, warmup_days=28)
    merged.to_csv(f"{OUT}/backtest_detail.csv", index=False)
    summary = bt.summarise_backtest(merged)
    with open(f"{OUT}/backtest_summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    for k, v in summary.items():
        print(f"  {k}: {v:.4f}" if isinstance(v, float) else f"  {k}: {v}")

    by_weekend = bt.segment_summary(merged, "is_weekend")
    by_weekend.to_csv(f"{OUT}/backtest_by_weekend.csv", index=False)
    by_archetype = bt.segment_summary(merged, "archetype")
    by_archetype.to_csv(f"{OUT}/backtest_by_archetype.csv", index=False)
    by_store = merged.groupby("store_id").apply(lambda x: pd.Series(bt.summarise_backtest(x)), include_groups=False).reset_index()
    by_store.to_csv(f"{OUT}/backtest_by_store.csv", index=False)
    worst_stores = by_store.sort_values("engine_mean_abs_pct_error", ascending=False).head(3)
    print("\n  Stores with highest engine error (worth investigating):")
    print(worst_stores[["store_id", "engine_mean_abs_pct_error", "baseline_mean_abs_pct_error"]].to_string(index=False))

    # ---------------- 5. Scenario & sensitivity testing ----------------
    print(f"\n--- Scenario testing ---")
    scen = sc.run_scenarios(forecast, stores)
    scen.to_csv(f"{OUT}/scenario_results.csv", index=False)
    print(scen[["scenario", "network_avg_required_headcount", "network_gap_headcount",
                "implied_cost_per_shipment_aed", "delta_gap_vs_base"]].to_string(index=False))

    lead_delay = sc.permanent_lead_time_delay_scenario(req)
    lead_delay.to_csv(f"{OUT}/scenario_lead_time_delay.csv", index=False)
    print("\n  Permanent lead-time delay exposure:")
    print(lead_delay.to_string(index=False))

    mix_sens = sc.mix_target_sensitivity(req)
    mix_sens.to_csv(f"{OUT}/scenario_mix_sensitivity.csv", index=False)
    print("\n  Mix-target sensitivity:")
    print(mix_sens.to_string(index=False))

    outs_cost_sens = sc.outsourced_cost_sensitivity(result)
    outs_cost_sens.to_csv(f"{OUT}/scenario_outsourced_cost_sensitivity.csv", index=False)
    print("\n  Outsourced-cost sensitivity (fixed headcount plan, re-costed):")
    print(outs_cost_sens.to_string(index=False))

    # ---------------- 6. Charts ----------------
    fig, axes = plt.subplots(2, 2, figsize=(13, 9))

    # (a) Network required vs existing headcount over 90 days
    daily_net = engine_daily.groupby("date").agg(required=("required_headcount", "sum")).reset_index()
    axes[0, 0].plot(daily_net["date"], daily_net["required"], label="Required headcount (network)")
    axes[0, 0].axhline(network_existing, color="red", linestyle="--", label="Existing headcount (network)")
    axes[0, 0].set_title("Network required vs existing headcount — 90-day forecast")
    axes[0, 0].legend(fontsize=8)
    axes[0, 0].tick_params(axis='x', rotation=30)

    # (b) Backtest: engine vs baseline mean abs % error by week
    merged["week"] = merged["date"].dt.to_period("W").apply(lambda p: p.start_time)
    weekly_err = merged.groupby("week")[["engine_abs_pct_error", "baseline_abs_pct_error"]].mean().reset_index()
    axes[0, 1].plot(weekly_err["week"], weekly_err["baseline_abs_pct_error"], label="Baseline")
    axes[0, 1].plot(weekly_err["week"], weekly_err["engine_abs_pct_error"], label="Engine")
    axes[0, 1].set_title("Backtest: mean abs % staffing error by week")
    axes[0, 1].legend(fontsize=8)
    axes[0, 1].tick_params(axis='x', rotation=30)

    # (c) Overstaffed/understaffed hours: baseline vs engine
    labels = ["Overstaffed hrs", "Understaffed hrs"]
    base_vals = [summary["baseline_overstaffed_hours"], summary["baseline_understaffed_hours"]]
    eng_vals = [summary["engine_overstaffed_hours"], summary["engine_understaffed_hours"]]
    x = np.arange(len(labels))
    axes[1, 0].bar(x - 0.2, base_vals, width=0.4, label="Baseline")
    axes[1, 0].bar(x + 0.2, eng_vals, width=0.4, label="Engine")
    axes[1, 0].set_xticks(x); axes[1, 0].set_xticklabels(labels)
    axes[1, 0].set_title("Total mismatch hours over backtest window")
    axes[1, 0].legend(fontsize=8)

    # (d) Scenario network gap
    axes[1, 1].barh(scen["scenario"], scen["network_gap_headcount"])
    axes[1, 1].set_title("Network gap (heads) by scenario")
    axes[1, 1].tick_params(axis='y', labelsize=7)

    plt.tight_layout()
    plt.savefig(f"{OUT}/summary_charts.png", dpi=150)
    print(f"\nCharts saved to {OUT}/summary_charts.png")

    print("\n" + "=" * 70)
    print("RUN COMPLETE — outputs written to:", OUT)
    print("=" * 70)


if __name__ == "__main__":
    main()
