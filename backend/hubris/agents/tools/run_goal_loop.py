"""Agent tool: T-13's goal-driven optimisation loop, finally reachable
(T-34 — the audit found it fully built, fully tested, and called from
nowhere). Wraps `run_goal_loop`: a plain-English objective drives
simulate → optimise → evaluate iterations against the REAL optimiser, and
the result carries the full path explored — every number in it comes from
real `optimise_network` calls, the LLM only parses the objective text."""

from hubris.agents.goal_loop import run_goal_loop
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool


@register_agent_tool
class RunGoalLoopTool(AgentTool):
    name = "run_goal_loop"
    description = (
        "Drive the optimiser toward a plain-English objective (e.g. 'cut "
        "cost-to-serve by at least 8%, keep every hub under 90% "
        "utilization') by iterating simulate -> optimise -> evaluate, "
        "relaxing the utilization cap step by step until the target is met "
        "or the search is exhausted. Returns: success (whether the target "
        "was met), target_pct_reduction, achieved_pct_reduction, "
        "recommendation (the final optimiser result — every figure in it is "
        "engine-computed), and path (one entry PER ITERATION with the "
        "constraints tried and the reduction achieved — report the path, "
        "not just the endpoint, so the planner sees what was explored). Use "
        "the returned figures directly; never extrapolate between "
        "iterations yourself. Can take tens of seconds — it re-solves the "
        "MILP per iteration."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "objective_text": {
                "type": "string",
                "description": "The plain-English objective, verbatim from the planner",
            },
            "max_iterations": {"type": "integer", "description": "Search cap; defaults to 5"},
        },
        "required": ["objective_text"],
    }

    def run(
        self,
        *,
        model: NetworkModel,
        objective_text: str,
        max_iterations: int = 5,
        **_: object,
    ) -> dict:
        return run_goal_loop(model, objective_text, max_iterations=max_iterations)
