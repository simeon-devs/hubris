"""T-43: proof that an EXTERNAL MCP client can operate the twin.

Not a "server starts" test: a real `mcp` ClientSession spawns
`python -m hubris.mcp_server` as a separate process over stdio, performs
the MCP handshake, lists the tools, and calls them — asserting the JSON it
receives across the protocol boundary is IDENTICAL to the internal path's
output for the same inputs.
"""

import asyncio
import json
import sys

import pytest
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from hubris.agents.tools.get_kpis import GetKpisTool
from hubris.api.state import AppState
from hubris.core.registry import AGENT_TOOL, load_plugins
from hubris.core.registry import registry as global_registry

SERVER = StdioServerParameters(command=sys.executable, args=["-m", "hubris.mcp_server"])


def _call(coro):
    return asyncio.run(asyncio.wait_for(coro, timeout=90))


async def _session_roundtrip():
    async with stdio_client(SERVER) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()

            listed = await session.list_tools()
            tools = {t.name: t for t in listed.tools}

            kpis_raw = await session.call_tool("get_kpis", {})
            kpis = json.loads(kpis_raw.content[0].text)

            sim_raw = await session.call_tool(
                "simulate_scenario",
                {"scenario_name": "close_hub", "params": {"hub_id": "HUB_RAK_01"}},
            )
            sim = json.loads(sim_raw.content[0].text)

            demo_raw = await session.call_tool("get_kpis", {"_scenario_id": "qcomm_twin"})
            demo = json.loads(demo_raw.content[0].text)

            bad_raw = await session.call_tool("optimise_network", {"optimizer_name": "MILP"})
            bad = json.loads(bad_raw.content[0].text)

            missing_raw = await session.call_tool("get_kpis", {"_scenario_id": "nope"})
            missing = json.loads(missing_raw.content[0].text)

            return tools, kpis, sim, demo, bad, missing


def test_external_mcp_client_operates_the_twin():
    tools, kpis, sim, demo, bad, missing = _call(_session_roundtrip())

    # Every registered tool is published — no per-tool wiring anywhere.
    load_plugins()
    registered = {t.name for t in global_registry.all(AGENT_TOOL)}
    assert set(tools) == registered
    # …with its real schema, plus the instance-state selector.
    assert "_scenario_id" in tools["get_kpis"].inputSchema["properties"]
    assert "objective" in tools["optimise_network"].inputSchema["properties"]

    # The JSON crossing the protocol boundary is IDENTICAL to the internal
    # path for the same input (same engine, same state semantics). The MCP
    # instance seeds the REAL twin at startup, so mirror that here.
    from hubris.api.state import seed_demo_scenario

    mirror = AppState()
    seed_demo_scenario(mirror)
    internal = GetKpisTool().run(model=mirror.baseline)
    assert kpis["cost_to_serve"]["value"] == internal["cost_to_serve"]["value"] == 43.1559
    assert kpis["network_summary"] == internal["network_summary"]

    # A real what-if through the wire, computed by the real engine.
    assert sim["scenario_kpis"]["cost_to_serve"]["value"] > 0
    assert sim["scenario_flow_feasible"] is True

    # The pre-seeded demo (the real QComm crisis) is reachable via
    # _scenario_id: dark stores running hot, hottest at 100%.
    stores = demo["utilization"]["breakdown"]
    assert set(stores) == {h.id for h in mirror.get_model("qcomm_twin").hubs}
    assert max(stores.values()) == 100.0

    # Graceful contract crosses the boundary too: bad args and bad
    # scenario ids come back as correctable payloads, not protocol errors.
    assert "MILP" in bad["error"]
    assert "unknown _scenario_id" in missing["error"]


def test_new_plugins_need_no_mcp_wiring():
    # The publication path is registry.all(AGENT_TOOL) at list time — the
    # server module contains no tool names. Static proof to pin the claim:
    import inspect

    import hubris.mcp_server.server as srv

    source = inspect.getsource(srv)
    load_plugins()
    for tool in global_registry.all(AGENT_TOOL):
        assert f'"{tool.name}"' not in source, f"per-tool wiring found for {tool.name}"
