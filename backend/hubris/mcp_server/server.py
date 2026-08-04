"""T-43 / W6: Hubris as an MCP server — any external AI or system can
operate the network twin over the Model Context Protocol.

The tool surface is GENERATED from the plugin registry
(`registry.all(AGENT_TOOL)`): implement `AgentTool`, register it, and it
is published here with no per-tool wiring — the same property that makes
every tool available to the internal agents (CLAUDE.md §5).

Guarantees carried across the protocol boundary:
- every result is the engine's computed JSON, byte-identical to the
  internal path (same `run()`, same model state);
- heuristic annotations (T-39) and episode recording (T-38, source "mcp")
  apply exactly as they do internally — an external caller's runs join the
  twin's history and benefit from its learning;
- bad arguments come back as a correctable `{"error": ...}` payload, never
  a protocol crash (the same graceful contract as the agent adapter).

Provenance note (T-33): MCP exposes TOOLS, which return engine JSON — no
LLM prose is produced on our side, so there is nothing for the provenance
gate to verify here. The external caller is the orchestrator; whatever
prose IT writes is outside our boundary. Our guarantee is that every
number it receives from us is engine-computed.

State note (honest limitation): the MCP server is its own process with its
own twin instance — baseline + the seeded demo scenario (`demo_surge`).
Scenarios saved via the HTTP API live in that process's memory and are NOT
visible here (and vice versa); durable cross-process state is exactly what
the Postgres-backed memory tiers are for. Pass `_scenario_id` to target a
scenario saved IN THIS process.
"""

import json
from copy import deepcopy

import anyio
import mcp.types as types
from mcp.server import Server
from mcp.server.stdio import stdio_server

from hubris.api.state import AppState, seed_demo_scenario
from hubris.core.registry import AGENT_TOOL, load_plugins
from hubris.core.registry import registry as global_registry

_SCENARIO_PARAM = {
    "type": "string",
    "description": (
        "Optional: id of a scenario saved in this MCP twin instance "
        "('demo_surge' is pre-seeded). Omit for the live baseline."
    ),
}


def build_server() -> tuple[Server, AppState]:
    load_plugins()
    state = AppState()
    seed_demo_scenario(state)

    server = Server("hubris")

    @server.list_tools()
    async def list_tools() -> list[types.Tool]:
        tools = []
        for tool in global_registry.all(AGENT_TOOL):
            schema = deepcopy(tool.input_schema) or {"type": "object", "properties": {}}
            schema.setdefault("properties", {})["_scenario_id"] = deepcopy(_SCENARIO_PARAM)
            tools.append(
                types.Tool(name=tool.name, description=tool.description, inputSchema=schema)
            )
        return tools

    @server.call_tool()
    async def call_tool(name: str, arguments: dict | None) -> list[types.TextContent]:
        result = await anyio.to_thread.run_sync(_run_tool, state, name, dict(arguments or {}))
        return [types.TextContent(type="text", text=json.dumps(result))]

    return server, state


def _run_tool(state: AppState, name: str, args: dict) -> dict:
    tool = next((t for t in global_registry.all(AGENT_TOOL) if t.name == name), None)
    if tool is None:
        return {
            "error": f"unknown tool: {name}",
            "hint": "list_tools gives the registered names",
        }

    scenario_id = args.pop("_scenario_id", None)
    try:
        model = state.get_model(scenario_id)
    except KeyError:
        return {
            "error": f"unknown _scenario_id: {scenario_id}",
            "hint": "omit it for the baseline; 'demo_surge' is pre-seeded in this instance",
        }

    try:
        result = tool.run(model=model, **args)
    except Exception as exc:  # noqa: BLE001 — same graceful contract as the adapter
        return {
            "error": f"{type(exc).__name__}: {exc}",
            "tool": name,
            "hint": "The tool itself is available — correct the arguments per its description.",
        }

    # The twin's history + learning apply to external callers too.
    try:
        from hubris.agents.tool_adapter import _EPISODE_TOOLS, _record_tool_episode
        from hubris.memory.apply import apply_heuristics

        if name in _EPISODE_TOOLS:
            _record_tool_episode(name, args, result, source_prefix="mcp")
        result = apply_heuristics(name, result)
    except Exception:  # noqa: BLE001 — memory is never a failure mode (rule 4)
        pass
    return result


async def main() -> None:
    server, _state = build_server()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())
