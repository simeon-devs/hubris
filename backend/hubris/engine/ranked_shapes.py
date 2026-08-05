"""Ranked network shapes — Sims' rule: the card stays, but ON REAL DATA.

A bounded, fully-enumerated comparison of candidate network shapes, every
row an actual engine evaluation (reassigned flow solve + the real cost
metric + real stress re-solves) — never a heuristic score:

  - the CURRENT shape,
  - close-one for every open hub,
  - open-one for every candidate site,
  - the frontier's constrained optimum (the recommendation),
  - the frontier's raw optimum (reported, never recommended).

Stress-safety = the share of five demand scales (0.8x-1.2x) whose re-solved
flow stays feasible — five real LP solves per shape, not an extrapolation.
Infeasible shapes are kept, marked, and ranked last so the UI can show WHY
a shape loses, instead of silently hiding it.
"""

from hubris.core.contracts import NetworkModel
from hubris.engine.assignment import dominant_hub_per_zone
from hubris.engine.flow import solve_min_cost_flow
from hubris.plugins.metrics.cost_to_serve import CostToServeMetric

STRESS_SCALES = (0.8, 0.9, 1.0, 1.1, 1.2)


def _apply_shape(model: NetworkModel, opens: list[str], closes: list[str]) -> NetworkModel:
    copy = model.model_copy(deep=True)
    for hub in copy.hubs:
        if hub.id in closes:
            hub.status = "closed"
        elif hub.id in opens:
            hub.status = "open"
    return copy


def _evaluate(model: NetworkModel, label: str, opens: list[str], closes: list[str]) -> dict:
    shaped = _apply_shape(model, opens, closes)
    flow = solve_min_cost_flow(shaped)
    shaped = shaped.model_copy(update={"assignments": dominant_hub_per_zone(flow.flows)})
    metric = CostToServeMetric().compute(shaped, None)

    stress_ok = 0
    for scale in STRESS_SCALES:
        stressed = shaped.model_copy(deep=True)
        for zone in stressed.zones:
            zone.demand = zone.demand * scale
        stressed.demand = {z.id: z.demand for z in stressed.zones}
        if solve_min_cost_flow(stressed).feasible:
            stress_ok += 1

    return {
        "label": label,
        "opens": sorted(opens),
        "closes": sorted(closes),
        "hubs_open": sum(1 for h in shaped.hubs if h.status == "open"),
        "cps": metric.value,
        "aed_day": metric.breakdown["total_cost"],
        "stress_safe_pct": round(stress_ok / len(STRESS_SCALES) * 100, 1),
        "feasible": flow.feasible,
    }


def rank_network_shapes(
    model: NetworkModel,
    limit: int = 8,
    frontier_constrained_changes: list[dict] | None = None,
    frontier_raw_changes: list[dict] | None = None,
) -> dict:
    open_ids = [h.id for h in model.hubs if h.status == "open"]
    candidate_ids = [h.id for h in model.hubs if h.status == "candidate"]

    shapes = [("Current network", [], [])]
    shapes += [(f"Close {hub_id}", [], [hub_id]) for hub_id in open_ids]
    shapes += [(f"Open {hub_id}", [hub_id], []) for hub_id in candidate_ids]

    def _changes_to_shape(changes: list[dict]) -> tuple[list[str], list[str]]:
        opens = [c["hub_id"] for c in changes if c.get("action") == "open_hub"]
        closes = [c["hub_id"] for c in changes if c.get("action") == "close_hub"]
        return opens, closes

    recommended_key = current_key = (tuple(), tuple())
    if frontier_constrained_changes is not None:
        opens, closes = _changes_to_shape(frontier_constrained_changes)
        shapes.append(("Recommended (resilient optimum)", opens, closes))
        recommended_key = (tuple(sorted(opens)), tuple(sorted(closes)))
    if frontier_raw_changes is not None:
        opens, closes = _changes_to_shape(frontier_raw_changes)
        shapes.append(("Raw optimum (not recommended)", opens, closes))

    seen: set[tuple] = set()
    rows = []
    for label, opens, closes in shapes:
        key = (tuple(sorted(opens)), tuple(sorted(closes)))
        if key in seen:
            continue
        seen.add(key)
        row = _evaluate(model, label, opens, closes)
        row["is_current"] = key == current_key
        row["is_recommended"] = key == recommended_key
        rows.append(row)

    # feasible first, then cheapest per day; infeasible ranked last, visible
    rows.sort(key=lambda r: (not r["feasible"], r["aed_day"]))
    baseline = next(r for r in rows if r["is_current"])
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
        row["save_aed_month"] = round((baseline["aed_day"] - row["aed_day"]) * 30, 2)

    # The current shape always ships, with its TRUE rank — on the real twin
    # it's the most expensive row, and hiding it would hide the contrast.
    top = rows[:limit]
    if not any(r["is_current"] for r in top):
        top = top[: limit - 1] + [baseline]

    return {
        "shapes": top,
        "evaluated": len(rows),
        "feasible_count": sum(1 for r in rows if r["feasible"]),
        "baseline_cps": baseline["cps"],
        "basis": (
            "every row is a real engine evaluation: reassigned flow solve + cost "
            "metric + five stress re-solves (0.8x-1.2x demand)"
        ),
    }
