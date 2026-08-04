"""Shared helper for agent tools that apply a scenario: a scenario only
changes structure (T-10 — e.g. `close_hub` just flips status, it doesn't
reassign zones itself), so KPIs computed straight off its output would
still show demand "assigned" to a hub that's now closed/moved/added. Always
re-solve flow after applying a scenario so KPIs reflect a realistic
reassignment."""

from hubris.core.contracts import NetworkModel
from hubris.core.registry import SCENARIO
from hubris.core.registry import registry as global_registry
from hubris.engine.assignment import dominant_hub_per_zone
from hubris.engine.flow import FlowResult, solve_min_cost_flow


def apply_and_reassign(
    model: NetworkModel, scenario_name: str, params: dict
) -> tuple[NetworkModel, FlowResult]:
    scenario = global_registry.get(SCENARIO, scenario_name)
    scenario_model = scenario.apply(model, params)
    flow = solve_min_cost_flow(scenario_model)
    reassigned_model = scenario_model.model_copy(
        update={
            "assignments": dominant_hub_per_zone(flow.flows),
            # Keep the exact split volumes alongside the dominant-hub collapse
            # so capacity metrics can report flow-true utilization (never the
            # >100% overcount artifact of attributing full zones).
            "flow_volumes": flow.flows,
        }
    )
    return reassigned_model, flow
