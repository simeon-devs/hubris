"""A single tool-calling agent, built with LangGraph's prebuilt ReAct agent,
bound to Claude and a specific `NetworkModel` + tool subset. This is the one
building block T-12's workforce, T-13's goal loop, and T-14's Agent Builder
are all composed from — same runner, different system prompt + tool subset.

Grounding is enforced in TWO layers, both live:
1. The system prompt forbids the LLM from computing numbers itself.
2. After every run, `run_agent_query` verifies the answer's numbers against
   the actual tool results via `hubris/agents/provenance.py`. An answer with
   unexplained numbers is retried once with an explicit correction; if it
   still fails, the response is returned flagged (`verification.grounded is
   False`) so the API/UI can badge it as unverified instead of presenting a
   fabricated figure as fact. No agent answer leaves this module unchecked.
"""

import json
import os
import warnings

# LangGraph deprecates create_react_agent in favor of langchain.agents.create_agent
# (an extra dependency this project doesn't otherwise need). It is still fully
# functional; silence the warning so it can't leak into a live demo terminal.
warnings.filterwarnings("ignore", message=".*create_react_agent.*")

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from hubris.agents.provenance import find_unexplained_numbers
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

CORRECTION_PROMPT = """Your previous answer contained these figures that do NOT appear in any tool result you received: {unexplained}.

Rewrite your answer now, following the rules strictly:
- State ONLY figures that appear verbatim in the tool results above (rounding for readability is fine).
- If a figure you want to state is not directly in a tool result, either call a tool that returns it, or explicitly say it is not available — never derive it yourself.
Reply with the corrected answer only."""


def build_agent(
    model: NetworkModel,
    tools: list[AgentTool],
    system_prompt: str | None = None,
    model_name: str = DEFAULT_MODEL,
):
    llm = ChatAnthropic(model=model_name, max_tokens=2048, api_key=os.environ.get("ANTHROPIC_API_KEY"))
    langchain_tools = to_langchain_tools(tools, model)
    return create_react_agent(llm, langchain_tools, prompt=system_prompt or NO_FABRICATION_SYSTEM_PROMPT)


def _transcript(messages: list) -> tuple[str, list[dict]]:
    """Collapse a LangGraph message list into (final_answer, ordered tool
    calls with results attached)."""
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
    if isinstance(final_answer, list):  # Anthropic content blocks
        final_answer = " ".join(
            block.get("text", "") if isinstance(block, dict) else str(block) for block in final_answer
        )
    return final_answer, [calls_by_id[cid] for cid in call_order]


def _parsed_results(tool_calls: list[dict]) -> list[object]:
    """Tool results as structured values where possible (they arrive as JSON
    strings); raw strings still contribute via provenance's text extraction."""
    parsed: list[object] = []
    for call in tool_calls:
        result = call["result"]
        if isinstance(result, str):
            try:
                parsed.append(json.loads(result))
                continue
            except (TypeError, ValueError):
                pass
        parsed.append(result)
    return parsed


def verify_answer(answer: str, tool_calls: list[dict], question: str) -> dict:
    """The runtime guardrail: which numbers in `answer` cannot be traced to
    any tool result (or the user's own question)?"""
    unexplained = find_unexplained_numbers(answer, _parsed_results(tool_calls), question=question)
    return {"grounded": not unexplained, "unexplained_numbers": unexplained}


def run_agent_query(
    model: NetworkModel,
    tools: list[AgentTool],
    question: str,
    system_prompt: str | None = None,
    model_name: str = DEFAULT_MODEL,
) -> dict:
    """Runs the agent to completion and returns a transcript: the final
    answer, every tool call made along the way (name, args, result), and a
    `verification` verdict from the provenance guardrail. If the first
    answer contains numbers no tool produced, the agent is asked once to
    correct itself against its own tool results; a persistent failure is
    returned flagged rather than silently presented as fact."""
    agent = build_agent(model, tools, system_prompt, model_name)
    result = agent.invoke({"messages": [{"role": "user", "content": question}]})
    messages = result["messages"]
    answer, tool_calls = _transcript(messages)

    verification = verify_answer(answer, tool_calls, question)
    retried = False

    if not verification["grounded"]:
        retried = True
        correction = CORRECTION_PROMPT.format(
            unexplained=", ".join(str(n) for n in verification["unexplained_numbers"])
        )
        result = agent.invoke({"messages": [*messages, {"role": "user", "content": correction}]})
        messages = result["messages"]
        answer, tool_calls = _transcript(messages)
        verification = verify_answer(answer, tool_calls, question)

    return {
        "answer": answer,
        "tool_calls": tool_calls,
        "verification": {**verification, "retried": retried},
    }
