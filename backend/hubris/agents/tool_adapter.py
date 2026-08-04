"""Adapts a registry `AgentTool` (Python-native — its `run()` takes a
`NetworkModel` object) into a LangChain `StructuredTool` bound to one
specific model. The LLM never sees or invents the network state itself —
only the tool's own business parameters (scenario name, params, objective,
constraints, ...); `model` is bound by closure at agent-construction time.
"""

from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import create_model

from hubris.core.contracts import AgentTool, NetworkModel

# T-38: agent-invoked what-ifs/optimisations are part of the twin's history
# too — recorded at this chokepoint so EVERY run becomes an episode,
# whether a human clicked it or an agent chose it.
_EPISODE_TOOLS = {"simulate_scenario", "optimise_network"}

_JSON_TYPE_MAP: dict[str, type] = {
    "string": str,
    "number": float,
    "integer": int,
    "boolean": bool,
    "object": dict,
    "array": list,
}


def _field_type(field_schema: dict) -> type:
    json_type = field_schema.get("type", "string")
    if isinstance(json_type, list):
        json_type = next((t for t in json_type if t != "null"), "string")
    return _JSON_TYPE_MAP.get(json_type, str)


def _args_schema(tool: AgentTool) -> type:
    schema = tool.input_schema or {}
    properties = {k: v for k, v in schema.get("properties", {}).items() if k != "model"}
    required = {f for f in schema.get("required", []) if f != "model"}

    fields: dict[str, Any] = {}
    for field_name, field_schema in properties.items():
        py_type = _field_type(field_schema)
        description = field_schema.get("description", "")
        if field_name in required:
            fields[field_name] = (py_type, ...)
        else:
            fields[field_name] = (py_type | None, None)
        if description:
            # pydantic Field with description would be nicer, but a plain
            # default keeps this dynamic-model builder simple; description
            # still reaches the LLM via the tool's own `description` text.
            pass

    return create_model(f"{tool.name}_Args", **fields)  # type: ignore[call-overload]


def _apply_heuristics_safe(tool_name: str, result):
    """T-39: attach matching stored heuristics to this tool's result —
    memory influencing attention/explanation, never computation. Lazy
    import + best-effort, same zero-hard-dependency rule as episodes."""
    try:
        from hubris.memory.apply import apply_heuristics

        return apply_heuristics(tool_name, result)
    except Exception:  # noqa: BLE001
        return result


def _record_tool_episode(tool_name: str, kwargs: dict, result: dict, source_prefix: str = "agent") -> None:
    """Best-effort, graceful — import inside the function so the adapter
    has zero hard dependency on the memory layer."""
    try:
        from hubris.memory.store import memory

        if tool_name == "simulate_scenario":
            memory.record_episode(
                scenario_name=kwargs.get("scenario_name", "simulate_scenario"),
                params=kwargs.get("params", {}),
                kpis=result.get("scenario_kpis", {}),
                outcome={
                    "feasible": result.get("scenario_flow_feasible"),
                    "delta_pct": result.get("delta_pct", {}),
                },
                source=f"{source_prefix}:simulate_scenario",
            )
        else:
            memory.record_episode(
                scenario_name="optimise_network",
                params={k: v for k, v in kwargs.items() if k != "model"},
                kpis={
                    "cost_to_serve_before": result.get("cost_to_serve_before"),
                    "cost_to_serve_after": result.get("cost_to_serve_after"),
                    "total_cost_savings": result.get("total_cost_savings"),
                },
                outcome={
                    "changes": result.get("changes", []),
                    "objective_value": result.get("objective_value"),
                },
                source=f"{source_prefix}:optimise_network",
            )
    except Exception:  # noqa: BLE001 — never let memory recording break a tool call
        return


def to_langchain_tool(tool: AgentTool, model: NetworkModel) -> StructuredTool:
    def _call(**kwargs: Any) -> dict:
        # Every optional field in the dynamically-built args schema defaults
        # to None (we don't have each tool's real Python default to mirror
        # here) — an LLM that passes null explicitly for an unused optional
        # arg would otherwise clobber the tool's own, more useful default
        # (e.g. optimizer_name="milp_cflp"). Dropping None lets the tool's
        # real default apply either way.
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        try:
            result = tool.run(model=model, **kwargs)
            if tool.name in _EPISODE_TOOLS:
                _record_tool_episode(tool.name, kwargs, result)
            result = _apply_heuristics_safe(tool.name, result)
            return result
        except Exception as exc:  # noqa: BLE001
            # Graceful-fallback rule (build rule 4 / CLAUDE.md §7 "the demo
            # never hangs"): a bad argument from the LLM (e.g.
            # optimizer_name="MILP", live-observed) must reach the agent as
            # a correctable tool RESULT, never crash the whole query —
            # LangGraph's tool node re-raises unhandled tool exceptions.
            return {
                "error": f"{type(exc).__name__}: {exc}",
                "tool": tool.name,
                "hint": (
                    "The tool itself is available — the arguments were invalid. "
                    "Correct them per the tool description and call it again."
                ),
            }

    return StructuredTool.from_function(
        func=_call,
        name=tool.name,
        description=tool.description,
        args_schema=_args_schema(tool),
    )


def to_langchain_tools(tools: list[AgentTool], model: NetworkModel) -> list[StructuredTool]:
    return [to_langchain_tool(tool, model) for tool in tools]
