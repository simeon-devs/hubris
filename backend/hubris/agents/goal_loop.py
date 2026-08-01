"""Goal-driven optimisation loop (BUILD_SPEC §5.3): a plain-English
objective ("cut cost 5%, no hub over 90%") drives simulate/optimise/
evaluate iterations via the real optimiser (T-09), returning both the
final answer and the full path explored. The LLM only parses intent and
decides when to stop searching — the search itself, and every number in
the result, comes from real `optimise_network` calls.
"""

import json
from typing import Callable

from langchain_anthropic import ChatAnthropic

from hubris.agents.tools.optimise_network import OptimiseNetworkTool
from hubris.core.contracts import NetworkModel

PARSE_OBJECTIVE_PROMPT = """Parse this logistics planning objective into JSON with exactly these fields:
- "target_cost_reduction_pct": number (the minimum % cost-to-serve reduction wanted; default 5.0 if not stated)
- "max_utilization": number between 0 and 1, or null if no cap is stated (e.g. "no hub over 90%" -> 0.9)

Objective: {objective}

Reply with ONLY the JSON object, nothing else — no markdown fences, no prose."""

ObjectiveParser = Callable[[str], dict]

DEFAULT_TARGET_PCT = 5.0
UTILIZATION_RELAX_STEP = 0.05
DEFAULT_MAX_ITERATIONS = 5


def _llm_parse_objective(objective_text: str) -> dict:
    llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=100)
    response = llm.invoke(PARSE_OBJECTIVE_PROMPT.format(objective=objective_text))
    text = str(response.content).strip()
    try:
        parsed = json.loads(text)
        return {
            "target_cost_reduction_pct": float(
                parsed.get("target_cost_reduction_pct", DEFAULT_TARGET_PCT)
            ),
            "max_utilization": parsed.get("max_utilization"),
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return {"target_cost_reduction_pct": DEFAULT_TARGET_PCT, "max_utilization": None}


def run_goal_loop(
    model: NetworkModel,
    objective_text: str,
    max_iterations: int = DEFAULT_MAX_ITERATIONS,
    parse_objective: ObjectiveParser | None = None,
) -> dict:
    parser = parse_objective or _llm_parse_objective
    target = parser(objective_text)
    target_pct = target["target_cost_reduction_pct"]
    max_utilization = target["max_utilization"]

    tool = OptimiseNetworkTool()
    path: list[dict] = []
    achieved_pct: float | None = None
    recommendation: dict | None = None

    for iteration in range(max_iterations):
        constraints = (
            [{"type": "max_utilization", "value": max_utilization}] if max_utilization else []
        )
        recommendation = tool.run(model=model, constraints=constraints)
        achieved_pct = -recommendation["delta_vs_baseline"]["cost_to_serve_pct"]

        path.append(
            {
                "iteration": iteration,
                "constraints": constraints,
                "achieved_pct_reduction": round(achieved_pct, 4),
                "objective_value": recommendation["objective_value"],
                "changes": recommendation["changes"],
                "robustness": recommendation["robustness"],
            }
        )

        if achieved_pct >= target_pct:
            return {
                "success": True,
                "objective_text": objective_text,
                "target_pct_reduction": target_pct,
                "max_utilization_cap": target["max_utilization"],
                "achieved_pct_reduction": round(achieved_pct, 4),
                "recommendation": recommendation,
                "path": path,
            }

        if max_utilization is None:
            break  # nothing left to adjust — re-running would repeat the same result
        max_utilization = min(1.0, max_utilization + UTILIZATION_RELAX_STEP)

    return {
        "success": False,
        "objective_text": objective_text,
        "target_pct_reduction": target_pct,
        "max_utilization_cap": target["max_utilization"],
        "achieved_pct_reduction": round(achieved_pct, 4) if achieved_pct is not None else None,
        "recommendation": recommendation,
        "path": path,
    }
