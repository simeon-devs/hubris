"""Agent tool: apply a named what-if scenario and report the resulting KPIs
plus the delta vs baseline — the "live what-if" the agent drives. Baseline
and scenario coexist (T-10); this never mutates the input model."""

from hubris.agents.scenario_utils import apply_and_reassign
from hubris.agents.tools.get_kpis import GetKpisTool
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import SCENARIO, register_agent_tool
from hubris.core.registry import registry as global_registry


def _describe_scenarios() -> str:
    lines = [
        "Apply a named what-if scenario to the network model, and return the "
        "resulting KPIs plus the delta (absolute) and delta_pct (percentage) "
        "vs the baseline model's KPIs — use delta_pct directly, never compute "
        "a percentage change yourself. Never mutates the input model. `params` "
        "MUST match the scenario's own field names exactly — available scenarios:"
    ]
    for scenario in global_registry.all(SCENARIO):
        schema = scenario.params_schema
        lines.append(
            f"- {scenario.name}: params fields = {schema.get('properties', {})}, "
            f"required = {schema.get('required', [])}"
        )
    return "\n".join(lines)


@register_agent_tool
class SimulateScenarioTool(AgentTool):
    name = "simulate_scenario"
    input_schema = {
        "type": "object",
        "properties": {
            "scenario_name": {"type": "string"},
            "params": {"type": "object"},
        },
        "required": ["scenario_name", "params"],
    }

    @property
    def description(self) -> str:  # evaluated lazily so scenario registration order never matters
        return _describe_scenarios()

    def run(self, *, model: NetworkModel, scenario_name: str, params: dict, **_: object) -> dict:
        reassigned_model, flow = apply_and_reassign(model, scenario_name, params)

        kpi_tool = GetKpisTool()
        baseline_kpis = kpi_tool.run(model=model)
        scenario_kpis = kpi_tool.run(model=reassigned_model)

        delta = {}
        delta_pct = {}
        for metric_name in baseline_kpis:
            baseline_value = baseline_kpis[metric_name]["value"]
            scenario_value = scenario_kpis[metric_name]["value"]
            if not isinstance(baseline_value, (int, float)) or not isinstance(
                scenario_value, (int, float)
            ):
                continue
            delta[metric_name] = round(scenario_value - baseline_value, 4)
            delta_pct[metric_name] = (
                round((scenario_value - baseline_value) / baseline_value * 100, 4)
                if baseline_value
                else 0.0
            )

        return {
            "scenario_name": scenario_name,
            "params": params,
            "baseline_kpis": baseline_kpis,
            "scenario_kpis": scenario_kpis,
            "delta": delta,
            "delta_pct": delta_pct,
            "scenario_flow_feasible": flow.feasible,
        }
