"""
Capacity-Conversion Engine
===========================
Implements, explicitly and in order, the nine calculation steps required
by the brief:
  1. Forecast workload
  2. Productive courier-hours required
  3. Capacity shrinkage
  4. Effective available courier-hours
  5. Required scheduled courier-hours
  6. Required courier headcount
  7. Staffing surplus or shortage
  8. Permanent and outsourced allocation      (see optimize.py)
  9. Hiring requirement and hiring date       (see optimize.py)

Formula provenance:
  - "Parcels per labour hour" as the core productivity denominator:
    DERIVED from doc3 p.38 formula "Completed eligible parcel tasks /
    paid direct labour hours".
  - Driver/workforce utilisation = "Productive paid time / available
    paid time": doc1 p.34.
  - Capacity forecasting should combine demand forecast with productivity
    and absence distributions and output scenario bands, not single-point
    values: doc1 p.17.
  - Store-level differentiation (not a single network-wide average):
    doc1 p.9 ("Parcels per vehicle, hub and labour hour" as a KPI),
    doc3 p.38 (same KPI defined per site).
All numeric parameter VALUES feeding these formulas are ASSUMED
(config.py) because no EMX figure exists in the source PDFs.
"""
import pandas as pd
import config as cfg


def workload_minutes(row) -> float:
    """Step 1+2 combined: forecast workload -> minutes of productive + travel work."""
    shipments = row["shipments"]
    service_min = row["service_min"]
    travel_min = row["travel_min"]
    return shipments * (service_min + travel_min)


def required_courier_hours(df: pd.DataFrame) -> pd.DataFrame:
    """Step 2: Productive courier-hours required = workload minutes / 60."""
    df = df.copy()
    df["workload_minutes"] = df.apply(workload_minutes, axis=1)
    df["required_courier_hours"] = df["workload_minutes"] / 60.0
    return df


def apply_shrinkage_and_capacity(df: pd.DataFrame, absence_rate_override: float = None) -> pd.DataFrame:
    """
    Steps 3-6:
      3. Capacity shrinkage = rest days + leave/absence + breaks + non-productive time
      4. Effective available courier-hours per employed courier
      5. Required scheduled courier-hours (= required_courier_hours, restated for clarity)
      6. Required courier headcount = required_courier_hours / effective hours per head
    """
    df = df.copy()
    leave_rate = cfg.LEAVE_RATE if absence_rate_override is None else absence_rate_override

    availability_factor = (1 - cfg.REST_DAY_RATIO - leave_rate)          # Step 3 (headcount side)
    productive_fraction = (1 - cfg.BREAK_RATIO - cfg.TRAINING_NONPRODUCTIVE_RATIO) * cfg.UTILISATION_TARGET  # Step 3 (hour side)

    df["availability_factor"] = availability_factor
    df["productive_hour_fraction"] = productive_fraction

    # Effective productive hours contributed by ONE employed courier on an average day
    effective_hours_per_head = cfg.SHIFT_HOURS * availability_factor * productive_fraction
    df["effective_hours_per_head"] = effective_hours_per_head

    # Step 5: required scheduled courier-hours (explicit restatement)
    df["required_scheduled_courier_hours"] = df["required_courier_hours"]

    # Step 6: required headcount (employed, accounting for shrinkage)
    df["required_headcount"] = df["required_scheduled_courier_hours"] / effective_hours_per_head
    return df


def staffing_gap(df: pd.DataFrame) -> pd.DataFrame:
    """Step 7: Staffing surplus (+) or shortage (-)."""
    df = df.copy()
    df["existing_headcount"] = df["existing_permanent"] + df["existing_outsourced"]
    df["staffing_gap"] = df["required_headcount"] - df["existing_headcount"]
    df["gap_direction"] = df["staffing_gap"].apply(
        lambda g: "understaffed" if g > 0.25 else ("overstaffed" if g < -0.25 else "balanced")
    )
    return df


def run_engine(forecast_df: pd.DataFrame, stores_df: pd.DataFrame,
               absence_rate_override: float = None,
               shipments_col: str = "forecast_p50") -> pd.DataFrame:
    """
    End-to-end run of Steps 1-7 for a forecast/store panel.
    `forecast_df` must have columns: store_id, date, <shipments_col>.
    `stores_df` provides service_min, travel_min, existing workforce.
    """
    merged = forecast_df.merge(
        stores_df[["store_id", "city", "archetype", "service_min", "travel_min",
                   "stops_per_hour_cap", "existing_permanent", "existing_outsourced"]],
        on="store_id", how="left"
    )
    merged["shipments"] = merged[shipments_col]  # copy (not rename) so the original column survives
    merged = required_courier_hours(merged)
    merged = apply_shrinkage_and_capacity(merged, absence_rate_override=absence_rate_override)
    merged = staffing_gap(merged)
    return merged


def hourly_breakdown(daily_df: pd.DataFrame) -> pd.DataFrame:
    """
    Optional hour-level expansion: distributes each store-day's required
    courier-hours across operating hours using the ASSUMED intraday shape
    (config.HOURLY_DEMAND_SHAPE), to support the "by store, date, shift,
    and hour" requirement in the brief.
    """
    rows = []
    for _, r in daily_df.iterrows():
        for hour, share in cfg.HOURLY_DEMAND_SHAPE.items():
            rows.append(dict(
                store_id=r["store_id"], date=r["date"], hour=hour,
                required_courier_hours_hour=r["required_courier_hours"] * share,
                shipments_hour=r["shipments"] * share,
            ))
    return pd.DataFrame(rows)
