"""Agent tool: apply two named what-if scenarios to the same baseline model
and compare their resulting KPIs side by side (or one scenario vs the
untouched baseline)."""

from hubris.agents.scenario_utils import apply_and_reassign
from hubris.agents.tools.get_kpis import GetKpisTool
from hubris.agents.tools.simulate_scenario import _describe_scenarios
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool


@register_agent_tool
class CompareScenariosTool(AgentTool):
    name = "compare_scenarios"
    input_schema = {
        "type": "object",
        "properties": {
            "scenario_a_name": {"type": "string"},
            "scenario_a_params": {"type": "object"},
            "scenario_b_name": {"type": ["string", "null"]},
            "scenario_b_params": {"type": "object"},
        },
        "required": ["scenario_a_name", "scenario_a_params"],
    }

    @property
    def description(self) -> str:  # evaluated lazily so scenario registration order never matters
        return (
            "Apply two named what-if scenarios to the same baseline model and "
            "compare their resulting KPIs side by side. Pass scenario_b_name=null "
            "to compare a single scenario against the untouched baseline instead. "
            "`scenario_a_params`/`scenario_b_params` MUST match the scenario's own "
            "field names exactly. Returns delta_a_minus_b (absolute) and "
            "delta_pct_a_minus_b (percentage) — use delta_pct_a_minus_b directly, "
            "never compute a percentage change yourself.\n" + _describe_scenarios()
        )

    def run(
        self,
        *,
        model: NetworkModel,
        scenario_a_name: str,
        scenario_a_params: dict,
        scenario_b_name: str | None = None,
        scenario_b_params: dict | None = None,
        **_: object,
    ) -> dict:
        kpi_tool = GetKpisTool()

        model_a, _ = apply_and_reassign(model, scenario_a_name, scenario_a_params)
        kpis_a = kpi_tool.run(model=model_a)

        if scenario_b_name is not None:
            model_b, _ = apply_and_reassign(model, scenario_b_name, scenario_b_params or {})
            kpis_b = kpi_tool.run(model=model_b)
            label_b = scenario_b_name
        else:
            kpis_b = kpi_tool.run(model=model)
            label_b = "baseline"

        delta = {}
        delta_pct = {}
        for metric_name in kpis_a:
            # get_kpis also includes "network_summary", which isn't a
            # {"value": ...}-shaped MetricResult — skip anything that isn't.
            if not isinstance(kpis_a[metric_name], dict) or "value" not in kpis_a[metric_name]:
                continue
            value_a = kpis_a[metric_name]["value"]
            value_b = kpis_b[metric_name]["value"]
            if not isinstance(value_a, (int, float)) or not isinstance(value_b, (int, float)):
                continue
            delta[metric_name] = round(value_a - value_b, 4)
            delta_pct[metric_name] = round((value_a - value_b) / value_b * 100, 4) if value_b else 0.0

        return {
            "scenario_a": {"name": scenario_a_name, "kpis": kpis_a},
            "scenario_b": {"name": label_b, "kpis": kpis_b},
            "delta_a_minus_b": delta,
            "delta_pct_a_minus_b": delta_pct,
        }
