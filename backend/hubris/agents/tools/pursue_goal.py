"""Agent tool: the goal-driven optimisation loop (BUILD_SPEC §5.3), finally
reachable by users. A plain-English objective ("cut cost 5% with no hub over
90%") drives repeated real `optimise_network` solves — relaxing the
utilization cap step-by-step when the target isn't met — and returns the
final recommendation plus the full path explored. Every number in the
result comes from the engine's own solves (goal_loop.py); the LLM only
parses the objective and narrates."""

from hubris.agents.goal_loop import run_goal_loop
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import register_agent_tool


@register_agent_tool
class PursueGoalTool(AgentTool):
    name = "pursue_goal"
    description = (
        "Pursue a plain-English network objective (e.g. 'cut cost-to-serve 5% "
        "but keep every hub under 90% utilization') by iteratively running the "
        "real network optimiser, relaxing the utilization cap when the target "
        "cannot be met. Returns success/failure, the achieved % cost reduction, "
        "the final recommendation, and the full iteration path explored — use "
        "those figures directly, never recompute them."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "objective_text": {
                "type": "string",
                "description": "The planner's objective in plain English.",
            },
            "max_iterations": {"type": "integer", "default": 5},
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
