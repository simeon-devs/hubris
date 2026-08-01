"""Agent tool: T-24's auto decision-brief. Wraps
`hubris.agents.decision_brief.generate_decision_brief` — pure orchestration
over already-computed tool JSON (T-09 optimiser, T-20 robustness, T-23
bottleneck), so this returns computed JSON only, including a pre-built
`summary` paragraph built by plain string formatting, never the LLM."""

from hubris.agents.decision_brief import generate_decision_brief
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool


@register_agent_tool
class GenerateDecisionBriefTool(AgentTool):
    name = "generate_decision_brief"
    description = (
        "Generate a one-page leadership decision brief: current state (KPIs), "
        "the optimiser's proposed change, cost/risk (before/after cost-to-serve "
        "and savings), sensitivity (T-20's Monte Carlo robustness band), and "
        "what it unblocks (T-23's bottleneck unlock, if any binding constraint "
        "exists). Returns a `summary` paragraph plus the full structured data "
        "behind it — every number in `summary` is present elsewhere in the "
        "response. Use this directly when asked for a brief, business case, "
        "or leadership summary; never write one from tool results yourself."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "optimizer_name": {"type": "string"},
            "objective": {"type": "object"},
            "constraints": {"type": "array"},
            "demand_variation_pct": {"type": "number"},
        },
    }

    def run(
        self,
        *,
        model: NetworkModel,
        optimizer_name: str = "milp_cflp",
        objective: dict | None = None,
        constraints: list[dict] | None = None,
        demand_variation_pct: float = 20.0,
        **_: object,
    ) -> dict:
        return generate_decision_brief(
            model,
            optimizer_name=optimizer_name,
            objective=objective,
            constraints=constraints,
            demand_variation_pct=demand_variation_pct,
        )
