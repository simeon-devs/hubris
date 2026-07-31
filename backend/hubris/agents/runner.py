"""A single tool-calling agent, built with LangGraph's prebuilt ReAct agent,
bound to Claude and a specific `NetworkModel` + tool subset. This is the one
building block T-12's workforce, T-13's goal loop, and T-14's Agent Builder
are all composed from — same runner, different system prompt + tool subset.

The system prompt is the enforcement point for CLAUDE.md's one rule that
never moves: agents orchestrate and explain, the engine computes. It is not
the ONLY enforcement — `hubris/agents/provenance.py` checks the actual
answer against actual tool results after the fact, because a prompt alone
is a request, not a guarantee.
"""

import os

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from hubris.agents.tool_adapter import to_langchain_tools
from hubris.core.contracts import AgentTool, NetworkModel

DEFAULT_MODEL = "claude-haiku-4-5-20251001"

NO_FABRICATION_SYSTEM_PROMPT = """You are a logistics network planning assistant for EMX.

You have tools that compute real numbers from the network's deterministic engine. Rules you must never break:
1. Every number, percentage, cost, or count you state MUST appear directly in a tool result you actually received in this conversation — not just be derivable from one.
2. Never estimate, guess, round in your head, or compute, combine, add, subtract, multiply, or divide numbers yourself — even if every input to the calculation came from a tool. If you need a figure that isn't directly in a tool result (e.g. a total, a count, a ratio), say you don't have it, or call a tool that returns it directly. Do not do the arithmetic yourself and present the result as a fact.
3. If you don't have a tool result for something, say you don't know, or call a tool to find out. Never fill the gap with a plausible-sounding figure.
4. When you state a number, make it clear which tool result it came from, and only restate it (rounded for readability is fine) — never recompute it.
"""


def build_agent(
    model: NetworkModel,
    tools: list[AgentTool],
    system_prompt: str | None = None,
    model_name: str = DEFAULT_MODEL,
):
    # langgraph.prebuilt.create_react_agent is deprecated in favor of
    # langchain.agents.create_agent (LangGraph v1.0+), but that lives in the
    # full `langchain` package, an extra dependency this doesn't otherwise
    # need. create_react_agent is still fully functional (not yet removed);
    # revisit if/when LangGraph actually drops it.
    llm = ChatAnthropic(model=model_name, max_tokens=2048, api_key=os.environ.get("ANTHROPIC_API_KEY"))
    langchain_tools = to_langchain_tools(tools, model)
    return create_react_agent(llm, langchain_tools, prompt=system_prompt or NO_FABRICATION_SYSTEM_PROMPT)


def run_agent_query(
    model: NetworkModel,
    tools: list[AgentTool],
    question: str,
    system_prompt: str | None = None,
    model_name: str = DEFAULT_MODEL,
) -> dict:
    """Runs the agent to completion and returns a transcript: the final
    answer plus every tool call made along the way (name, args, result) —
    the "traceable to a tool call" evidence trail."""
    agent = build_agent(model, tools, system_prompt, model_name)
    result = agent.invoke({"messages": [{"role": "user", "content": question}]})
    messages = result["messages"]

    calls_by_id: dict[str, dict] = {}
    call_order: list[str] = []
    for msg in messages:
        tool_calls = getattr(msg, "tool_calls", None)
        if tool_calls:
            for call in tool_calls:
                calls_by_id[call["id"]] = {"tool": call["name"], "args": call["args"], "result": None}
                call_order.append(call["id"])
        if msg.__class__.__name__ == "ToolMessage":
            call_id = getattr(msg, "tool_call_id", None)
            if call_id in calls_by_id:
                calls_by_id[call_id]["result"] = msg.content

    final_answer = messages[-1].content if messages else ""

    return {
        "answer": final_answer,
        "tool_calls": [calls_by_id[cid] for cid in call_order],
    }
