"""A single tool-calling agent, built with LangGraph's prebuilt ReAct agent,
bound to Claude and a specific `NetworkModel` + tool subset. This is the one
building block T-12's workforce, T-13's goal loop, and T-14's Agent Builder
are all composed from — same runner, different system prompt + tool subset.

Enforcement of CLAUDE.md's one rule that never moves is three layers, and
the third one lives HERE (T-33 — the audit found the first two alone let a
seeded agent fabricate a figure in 3 of 5 live runs):

1. Structural — the agent's only route to a number is a tool call.
2. Instructional — the system prompt below forbids arithmetic/estimation.
3. Verification — `run_agent_query` checks every answer against the tool
   results that run actually received, BEFORE returning. An untraceable
   figure triggers exactly one regeneration pass with the figures named;
   if it still fails, the answer is returned with status="flagged" and the
   figures listed — never silently. There is no unverified return path.
"""

import json
import os

from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent

from hubris.agents.tool_adapter import to_langchain_tools
from hubris.agents.verifier import NumericProvenanceVerifier
from hubris.core.contracts import AgentTool, NetworkModel, ProvenanceVerifier

DEFAULT_MODEL = "claude-haiku-4-5-20251001"

NO_FABRICATION_SYSTEM_PROMPT = """You are a logistics network planning assistant for EMX.

You have tools that compute real numbers from the network's deterministic engine. Rules you must never break:
1. Every number, percentage, cost, or count you state MUST appear directly in a tool result you actually received in this conversation — not just be derivable from one.
2. Never estimate, guess, round in your head, or compute, combine, add, subtract, multiply, or divide numbers yourself — even if every input to the calculation came from a tool. If you need a figure that isn't directly in a tool result (e.g. a total, a count, a ratio), say you don't have it, or call a tool that returns it directly. Do not do the arithmetic yourself and present the result as a fact.
3. If you don't have a tool result for something, say you don't know, or call a tool to find out. Never fill the gap with a plausible-sounding figure.
4. When you state a number, make it clear which tool result it came from, and only restate it (rounded for readability is fine) — never recompute it.
"""

REGENERATION_PROMPT = """VERIFICATION FAILED. Your previous answer states the following figure(s), which do not appear in any tool result you received in this conversation: {figures}.

You must not compute, combine, estimate, or annualise numbers yourself — that is exactly what produced these figures. Rewrite your complete answer now, following these rules strictly:
- State only figures that appear directly in your tool results (rounding for readability is fine).
- If a figure you want to mention is not in any tool result, either call a tool that returns it directly, or say plainly that you do not have that figure.
- Do not apologise or explain the correction; just give the corrected answer."""


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


def _content_to_text(content: object) -> str:
    """A message's content is usually a str, but Anthropic responses can be
    a list of content blocks — flatten to plain text for verification."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "\n".join(parts)
    return str(content)


def _parse_transcript(messages: list) -> tuple[str, list[dict]]:
    """Final answer + every tool call made along the way (name, args,
    result) — the "traceable to a tool call" evidence trail."""
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

    final_answer = _content_to_text(messages[-1].content) if messages else ""
    return final_answer, [calls_by_id[cid] for cid in call_order]


def _evidence(tool_calls: list[dict]) -> list[object]:
    """Tool results parsed for verification. String results are parsed as
    JSON where possible; unparseable ones are kept as raw strings (the
    number extractor still scans them), so evidence is never silently
    narrower than what the agent actually saw."""
    parsed: list[object] = []
    for call in tool_calls:
        result = call["result"]
        if result is None:
            continue
        if isinstance(result, str):
            try:
                parsed.append(json.loads(result))
            except (TypeError, ValueError):
                parsed.append(result)
        else:
            parsed.append(result)
    return parsed


def run_verified_query(
    agent,
    question: str,
    verifier: ProvenanceVerifier | None = None,
) -> dict:
    """Run `agent` to completion, verify the answer against the tool results
    it actually received, regenerate once if needed, and return the
    transcript + a `verification` verdict. Every LLM-prose path in the
    system goes through here — there is no unverified variant."""
    verifier = verifier or NumericProvenanceVerifier()

    result = agent.invoke({"messages": [{"role": "user", "content": question}]})
    messages = result["messages"]
    answer, tool_calls = _parse_transcript(messages)

    first = verifier.verify(answer, _evidence(tool_calls), question=question)
    if first.status == "verified":
        verdict = first.model_copy(
            update={"attempts": 1, "checked_against": [c["tool"] for c in tool_calls]}
        )
        return {"answer": answer, "tool_calls": tool_calls, "verification": verdict.model_dump()}

    # One regeneration pass, naming the offending figures back to the agent.
    correction = REGENERATION_PROMPT.format(
        figures=", ".join(str(f) for f in first.untraceable_figures)
    )
    result = agent.invoke({"messages": list(messages) + [{"role": "user", "content": correction}]})
    messages = result["messages"]
    answer, tool_calls = _parse_transcript(messages)

    second = verifier.verify(answer, _evidence(tool_calls), question=question)
    verdict = second.model_copy(
        update={
            "status": "regenerated" if second.status == "verified" else "flagged",
            "attempts": 2,
            "checked_against": [c["tool"] for c in tool_calls],
        }
    )
    return {"answer": answer, "tool_calls": tool_calls, "verification": verdict.model_dump()}


def run_agent_query(
    model: NetworkModel,
    tools: list[AgentTool],
    question: str,
    system_prompt: str | None = None,
    model_name: str = DEFAULT_MODEL,
    verifier: ProvenanceVerifier | None = None,
) -> dict:
    """Runs the agent to completion and returns a transcript: the final
    answer, every tool call made along the way (name, args, result), and
    the provenance `verification` verdict — computed, not asserted."""
    agent = build_agent(model, tools, system_prompt, model_name)
    return run_verified_query(agent, question, verifier)
