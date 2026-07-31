"""Reads `OptimizerStrategy.optimize`'s `constraints: list[dict]` param.
Phase 1 supports one constraint type; T-13's goal-driven loop builds on this
with richer objective/constraint parsing later."""


def max_utilization_constraint(constraints: list[dict] | None) -> float:
    for constraint in constraints or []:
        if constraint.get("type") == "max_utilization":
            return float(constraint["value"])
    return 1.0
