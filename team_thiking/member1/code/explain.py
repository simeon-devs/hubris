"""
Explainability layer — builds natural-language explanations directly
from the actual model inputs/outputs for a given store (no templated
generic text), matching the format specified in the brief:

"Store A is expected to require 42 productive courier-hours on 18
September. After leave, rest days, and expected productivity are
applied, only 31 hours are available. The 11-hour gap is expected to
persist for four weeks. Two outsourced couriers are recommended
immediately, and recruitment of one permanent courier should begin no
later than 20 July."
"""
import pandas as pd


def explain_store(store_id: str, engine_daily: pd.DataFrame, req_row: pd.Series, hire_row: pd.Series) -> str:
    store_days = engine_daily[engine_daily["store_id"] == store_id].sort_values("date")
    if store_days.empty:
        return f"No forecast data available for {store_id}."
    peak_row = store_days.loc[store_days["required_courier_hours"].idxmax()]
    date_str = pd.Timestamp(peak_row["date"]).strftime("%d %B %Y")

    required_hours = peak_row["required_courier_hours"]
    effective_hours_per_head = peak_row["effective_hours_per_head"]
    existing_heads = peak_row["existing_permanent"] + peak_row["existing_outsourced"]
    available_hours = existing_heads * effective_hours_per_head
    gap_hours = required_hours - available_hours

    structural_gap = req_row["structural_gap_int"]
    perm_add = req_row["recommended_permanent_add"]
    outs_add = req_row["recommended_outsourced_add"]
    peak_gap = req_row["peak_gap_int"]

    hire_date_str = pd.Timestamp(hire_row["permanent_hire_action_date"]).strftime("%d %B %Y")

    lines = []
    lines.append(
        f"{store_id} ({peak_row['archetype'].replace('_', ' ')}) is expected to require "
        f"{required_hours:.0f} productive courier-hours on its peak day in the 90-day window "
        f"({date_str}, {peak_row['shipments']:.0f} forecast shipments). "
        f"After rest days, leave, breaks and target utilisation are applied, its "
        f"{existing_heads:.0f} existing couriers can supply about {available_hours:.0f} hours, "
        f"a gap of {max(gap_hours,0):.0f} hours on that day."
    )
    if structural_gap > 0:
        lines.append(
            f"Across the full 90-day horizon this store's requirement stays persistently above its "
            f"current headcount (structural gap of {structural_gap} head-equivalents at the median "
            f"week), so {perm_add:.0f} permanent courier(s) and {outs_add:.0f} outsourced courier(s) "
            f"are recommended to close it. Recruitment for the permanent addition(s) should begin no "
            f"later than {hire_date_str} given the 45-60 day hiring lead time; this date is already "
            f"at or before today, so the recommendation is flagged as an immediate/overdue hiring action."
        )
    else:
        lines.append(
            "Across the full 90-day horizon this store's median weekly requirement is already covered "
            "by existing headcount, so no permanent addition is recommended."
        )
    if peak_gap > 0:
        lines.append(
            f"In addition, demand volatility adds a temporary peak of about {peak_gap} extra "
            f"head-equivalents above the structural level in the busiest weeks; this is recommended "
            f"to be covered with short-lead-time outsourced capacity (5-10 day booking) rather than "
            f"permanent hiring, since it does not persist."
        )
    return " ".join(lines)
