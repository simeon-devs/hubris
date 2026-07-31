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


def to_langchain_tool(tool: AgentTool, model: NetworkModel) -> StructuredTool:
    def _call(**kwargs: Any) -> dict:
        # Every optional field in the dynamically-built args schema defaults
        # to None (we don't have each tool's real Python default to mirror
        # here) — an LLM that passes null explicitly for an unused optional
        # arg would otherwise clobber the tool's own, more useful default
        # (e.g. optimizer_name="milp_cflp"). Dropping None lets the tool's
        # real default apply either way.
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        return tool.run(model=model, **kwargs)

    return StructuredTool.from_function(
        func=_call,
        name=tool.name,
        description=tool.description,
        args_schema=_args_schema(tool),
    )


def to_langchain_tools(tools: list[AgentTool], model: NetworkModel) -> list[StructuredTool]:
    return [to_langchain_tool(tool, model) for tool in tools]
