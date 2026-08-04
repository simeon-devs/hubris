"""
Scenario and Sensitivity Testing
===================================
Re-runs the capacity-conversion engine on the 90-day forward forecast
under perturbed assumptions, and reports the resulting change in
network-wide required headcount, structural gap, and cost versus the
base case. Each scenario changes exactly one driver at a time so its
individual sensitivity can be isolated.
"""
import numpy as np
import pandas as pd
import config as cfg
import engine as eng
import optimize as opt


def _network_summary(engine_out: pd.DataFrame, label: str) -> dict:
    total_required = engine_out.groupby("store_id")["required_headcount"].mean().sum()
    total_existing = engine_out.groupby("store_id")[["existing_permanent", "existing_outsourced"]].first().sum().sum()
    gap = total_required - total_existing
    total_shipments = engine_out["shipments"].sum()
    total_hours = (engine_out["required_headcount"] * cfg.SHIFT_HOURS).sum()
    cost = total_hours * cfg.PERMANENT_COST_PER_HOUR_AED
    return dict(
        scenario=label,
        network_avg_required_headcount=round(total_required, 1),
        network_existing_headcount=round(total_existing, 1),
        network_gap_headcount=round(gap, 1),
        network_required_courier_hours_total=round(total_hours, 0),
        implied_labour_cost_aed=round(cost, 0),
        implied_cost_per_shipment_aed=round(cost / total_shipments, 3) if total_shipments else np.nan,
    )


def run_scenarios(forecast_df: pd.DataFrame, stores_df: pd.DataFrame) -> pd.DataFrame:
    results = []

    # Base case
    base_out = eng.run_engine(forecast_df, stores_df)
    results.append(_network_summary(base_out, "Base case"))

    # Demand +10% / +20% / +30%
    for pct in (0.10, 0.20, 0.30):
        fc = forecast_df.copy()
        fc["forecast_p50"] = fc["forecast_p50"] * (1 + pct)
        out = eng.run_engine(fc, stores_df)
        results.append(_network_summary(out, f"Demand +{int(pct*100)}%"))

    # Forecast accuracy deteriorating: use P95 instead of P50 (wide-band planning)
    out = eng.run_engine(forecast_df, stores_df, shipments_col="forecast_p95")
    results.append(_network_summary(out, "Forecast deteriorates (plan to P95 band)"))

    # Weekend demand spike: extra +25% uplift on top of existing weekend uplift
    fc = forecast_df.copy()
    fc.loc[fc["is_weekend"], "forecast_p50"] *= 1.25
    out = eng.run_engine(fc, stores_df)
    results.append(_network_summary(out, "Weekend demand spike (+25% on weekend days)"))

    # Increased absenteeism: leave/absence rate rises from 8% to 15%
    out = eng.run_engine(forecast_df, stores_df, absence_rate_override=0.15)
    results.append(_network_summary(out, "Absenteeism rises to 15%"))

    # Reduced store productivity: service+travel time +15% (slower stops)
    stores_slow = stores_df.copy()
    stores_slow["service_min"] *= 1.15
    stores_slow["travel_min"] *= 1.15
    out = eng.run_engine(forecast_df, stores_slow)
    results.append(_network_summary(out, "Productivity falls 15% (service+travel time up)"))

    # New store with limited history: add a synthetic new store with no
    # existing workforce, sized like a small suburban store, forecast
    # using the network average productivity (since it has no history of
    # its own) - demonstrates cold-start handling.
    new_store = pd.DataFrame([dict(store_id="NEW-01", city="Dubai (new)", archetype="suburban",
                                    base_daily_shipments=200, service_min=cfg.STORE_ARCHETYPES["suburban"]["service_min"],
                                    travel_min=cfg.STORE_ARCHETYPES["suburban"]["travel_min"],
                                    stops_per_hour_cap=cfg.STORE_ARCHETYPES["suburban"]["stops_per_hour_cap"],
                                    existing_permanent=0, existing_outsourced=0)])
    stores_with_new = pd.concat([stores_df, new_store], ignore_index=True)
    fc_new_rows = []
    for h, d in enumerate(sorted(forecast_df["date"].unique())):
        fc_new_rows.append(dict(store_id="NEW-01", date=d, forecast_p50=200 * (1 + 0.10 * np.sin(h / 10)),
                                 is_weekend=False))
    fc_new = pd.concat([forecast_df, pd.DataFrame(fc_new_rows)], ignore_index=True)
    out = eng.run_engine(fc_new, stores_with_new)
    results.append(_network_summary(out, "New store added (limited history, cold start)"))

    # Sudden campaign demand: force Black Friday-level uplift network-wide for the whole horizon
    fc = forecast_df.copy()
    fc["forecast_p50"] = fc["forecast_p50"] * cfg.CAMPAIGN_UPLIFT["black_friday"]
    out = eng.run_engine(fc, stores_df)
    results.append(_network_summary(out, "Sustained campaign-level demand (Black Friday uplift network-wide)"))

    df = pd.DataFrame(results)
    base_row = df.iloc[0]
    df["delta_gap_vs_base"] = df["network_gap_headcount"] - base_row["network_gap_headcount"]
    df["delta_cost_vs_base_aed"] = df["implied_labour_cost_aed"] - base_row["implied_labour_cost_aed"]
    return df


def permanent_lead_time_delay_scenario(req_df: pd.DataFrame, delay_days_options=(0, 15, 30)) -> pd.DataFrame:
    """What happens to service-level exposure if permanent recruitment
    takes longer than the 45-60 day assumption (e.g. market tightness)."""
    rows = []
    for delay in delay_days_options:
        total_lead = cfg.PERMANENT_LEAD_TIME_DAYS + delay
        weeks_exposed = total_lead / 7.0
        rows.append(dict(
            extra_delay_days=delay,
            effective_permanent_lead_time_days=total_lead,
            weeks_of_exposure_before_hire_lands=round(weeks_exposed, 1),
            structural_gap_heads_exposed=int(req_df["structural_gap_int"].sum()),
            courier_hours_at_risk_over_exposure=round(
                req_df["structural_gap_int"].sum() * cfg.SHIFT_HOURS * weeks_exposed * 7, 0
            ),
        ))
    return pd.DataFrame(rows)


def outsourced_cost_sensitivity(result_df: pd.DataFrame, rate_multipliers=(1.0, 1.1, 1.2, 1.35)) -> pd.DataFrame:
    """Re-costs the already-optimised recommendation (fixed headcount mix)
    under different outsourced hourly rate assumptions, isolating the pure
    cost impact of outsourced-market price changes without re-solving the
    allocation (i.e. 'what would this same plan cost if outsourced rates
    rose X%')."""
    total_perm_add = result_df["recommended_permanent_add"].sum()
    total_outs_add = result_df["recommended_outsourced_add"].sum() + result_df["peak_gap_int"].sum()
    perm_annual = opt.permanent_annual_cost()
    rows = []
    base_outs_annual = opt.outsourced_annual_cost()
    for m in rate_multipliers:
        outs_annual = base_outs_annual * m
        total_cost = total_perm_add * perm_annual + total_outs_add * outs_annual
        rows.append(dict(
            outsourced_rate_multiplier=m,
            outsourced_cost_per_hour_aed=round(cfg.OUTSOURCED_COST_PER_HOUR_AED * m, 2),
            total_permanent_heads=int(total_perm_add),
            total_outsourced_heads=int(total_outs_add),
            total_annual_cost_aed=round(total_cost, 0),
        ))
    df = pd.DataFrame(rows)
    df["delta_vs_base_aed"] = df["total_annual_cost_aed"] - df["total_annual_cost_aed"].iloc[0]
    return df


def mix_target_sensitivity(req_df: pd.DataFrame, targets=(0.5, 0.6, 0.7)) -> pd.DataFrame:
    """Re-solves the permanent/outsourced allocation LP under different
    network mix targets to show cost sensitivity to the 60/40 policy."""
    rows = []
    original_target = cfg.TARGET_PERMANENT_SHARE
    for t in targets:
        cfg.TARGET_PERMANENT_SHARE = t
        result, meta = opt.optimise_permanent_outsourced_mix(req_df)
        rows.append(dict(
            permanent_target=t,
            total_cost_aed=meta["total_cost_aed"],
            realised_permanent_share=meta["realised_permanent_share"],
            total_permanent_added=int(result["recommended_permanent_add"].sum()),
            total_outsourced_added=int(result["recommended_outsourced_add"].sum()),
        ))
    cfg.TARGET_PERMANENT_SHARE = original_target
    return pd.DataFrame(rows)
