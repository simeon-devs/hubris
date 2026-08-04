"""Monte Carlo robustness banding (T-20): given a FIXED network
configuration (e.g. the result of applying an optimiser's recommended
hub open/close changes), how does cost-to-serve behave if zone demand is
perturbed by up to `demand_variation_pct`, `trials` times?

Each trial re-solves the fast min-cost flow LP (`hubris.engine.flow`), not
the MILP — re-optimising hub open/close per trial would defeat the point
(the question is whether a fixed shape holds up under uncertainty, not
what the best shape would be for each perturbed demand) and would be far
too slow for a UI-facing sweep. Pure NumPy with a fixed seed -> the same
inputs always produce the same band (CLAUDE.md's determinism convention).
"""

import numpy as np
from pydantic import BaseModel

from hubris.core import assumptions
from hubris.core.contracts import NetworkModel
from hubris.engine.flow import solve_min_cost_flow

# T-32: values + evidence labels live in core/assumptions.py
DEFAULT_DEMAND_VARIATION_PCT = assumptions.value("mc_demand_variation_pct")
DEFAULT_TRIALS = assumptions.value("mc_trials")
DEFAULT_SEED = assumptions.value("mc_seed")


class RobustnessBand(BaseModel):
    demand_variation_pct: float
    trials: int
    cost_to_serve_p10: float
    cost_to_serve_p50: float
    cost_to_serve_p90: float
    feasible_pct: float  # % of trials where every zone's demand was fully met
    holds_under_variation: bool  # True iff every trial stayed feasible


def _with_zone_demand(model: NetworkModel, demand: dict[str, float]) -> NetworkModel:
    zones = [zone.model_copy(update={"demand": demand[zone.id]}) for zone in model.zones]
    return model.model_copy(update={"zones": zones, "demand": demand})


def apply_recommendation_changes(model: NetworkModel, changes: list[dict]) -> NetworkModel:
    """Flip hub open/close status per a Recommendation's `changes` (the only
    actions any registered optimiser emits) and return the resulting
    network — the configuration the robustness band should actually test,
    not the pre-recommendation baseline."""
    copy = model.model_copy(deep=True)
    hub_by_id = {hub.id: hub for hub in copy.hubs}
    for change in changes:
        hub = hub_by_id[change["hub_id"]]
        if change["action"] == "close_hub":
            hub.status = "closed"
        elif change["action"] == "open_hub":
            hub.status = "open"
    return copy


def compute_robustness_band(
    model: NetworkModel,
    demand_variation_pct: float = DEFAULT_DEMAND_VARIATION_PCT,
    trials: int = DEFAULT_TRIALS,
    seed: int = DEFAULT_SEED,
) -> RobustnessBand:
    zone_ids = [zone.id for zone in model.zones]
    base_demand = np.array([zone.demand for zone in model.zones])

    rng = np.random.default_rng(seed)
    factors = rng.uniform(
        1 - demand_variation_pct / 100,
        1 + demand_variation_pct / 100,
        size=(trials, len(zone_ids)),
    )
    perturbed = np.clip(base_demand * factors, 0.0, None)

    cost_per_parcel = np.empty(trials)
    feasible = np.empty(trials, dtype=bool)

    for t in range(trials):
        trial_demand = {zone_id: float(perturbed[t, i]) for i, zone_id in enumerate(zone_ids)}
        trial_model = _with_zone_demand(model, trial_demand)
        flow = solve_min_cost_flow(trial_model)

        trial_total_demand = sum(trial_demand.values())
        cost_per_parcel[t] = flow.total_cost / trial_total_demand if trial_total_demand else 0.0
        feasible[t] = flow.feasible

    return RobustnessBand(
        demand_variation_pct=demand_variation_pct,
        trials=trials,
        cost_to_serve_p10=round(float(np.percentile(cost_per_parcel, 10)), 4),
        cost_to_serve_p50=round(float(np.percentile(cost_per_parcel, 50)), 4),
        cost_to_serve_p90=round(float(np.percentile(cost_per_parcel, 90)), 4),
        feasible_pct=round(float(np.mean(feasible) * 100), 2),
        holds_under_variation=bool(np.all(feasible)),
    )
