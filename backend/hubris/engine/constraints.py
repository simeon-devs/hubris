"""Reads `OptimizerStrategy.optimize`'s `constraints: list[dict]` param.
Phase 1 supports one constraint type; T-13's goal-driven loop builds on this
with richer objective/constraint parsing later."""


def max_utilization_constraint(constraints: list[dict] | None) -> float:
    for constraint in constraints or []:
        if constraint.get("type") == "max_utilization":
            return float(constraint["value"])
    return 1.0


def min_hubs_per_emirate_constraint(constraints: list[dict] | None) -> int | None:
    """Realism/resilience: at least N open hubs in every emirate that has any
    facility (capped by availability inside the solver). None = not requested."""
    for constraint in constraints or []:
        if constraint.get("type") == "min_hubs_per_emirate":
            return int(constraint["value"])
    return None


def max_hub_volume_share_constraint(constraints: list[dict] | None) -> float | None:
    """Realism/resilience: no single hub may carry more than this fraction of
    total network volume (no single point of failure). None = not requested."""
    for constraint in constraints or []:
        if constraint.get("type") == "max_hub_volume_share":
            return float(constraint["value"])
    return None
