"""POST /agent/query + /agents CRUD — the agent chat endpoint and the
Agent Builder API (T-12/T-13/T-14). Every response preserves the full
tool-call trace (`tool_calls`) so the frontend can show which real
computation produced each number in the answer."""

import json
from typing import Any

from fastapi import APIRouter, HTTPException

from hubris.agents.builder import (
    AgentAlreadyExistsError,
    CustomAgentSpec,
    UnknownToolError,
    builder,
)
from hubris.agents.runner import run_agent_query
from hubris.agents.workforce import run_workforce_query
from hubris.api.schemas import (
    AgentQueryRequest,
    AgentQueryResponse,
    AgentSpecResponse,
    CreateAgentRequest,
    ToolCallTrace,
)
from hubris.api.state import state
from hubris.core.registry import AGENT_TOOL
from hubris.core.registry import registry as global_registry

router = APIRouter()


def _parse_tool_calls(tool_calls: list[dict]) -> list[ToolCallTrace]:
    traces = []
    for call in tool_calls:
        result: Any = call["result"]
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except (TypeError, ValueError):
                pass  # leave as raw text if it wasn't JSON
        traces.append(ToolCallTrace(tool=call["tool"], args=call["args"], result=result))
    return traces


def _run_guarded(run):
    """Rule 4 (demo never crashes): an upstream LLM failure — API down, key
    out of credits (observed live: anthropic.BadRequestError 'credit balance
    is too low'), network — must surface as a clean 503 the UI can display,
    never a raw 500 traceback. Deliberately AFTER the KeyError→404 handling
    at each call site; deterministic endpoints (/kpis, /simulate, ...) are
    untouched — the engine keeps answering even when the agent layer can't."""
    try:
        return run()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            503, f"Agent layer unavailable: {type(exc).__name__}: {exc}"
        ) from exc


@router.post("/agent/query", response_model=AgentQueryResponse)
def agent_query(req: AgentQueryRequest) -> AgentQueryResponse:
    try:
        model = state.get_model(req.scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {req.scenario_id}") from exc

    if req.agent_name:
        try:
            builder.get(req.agent_name)  # 404 for unknown names, before the 503 guard
        except KeyError as exc:
            raise HTTPException(404, f"Unknown agent: {req.agent_name}") from exc
        result = _run_guarded(lambda: builder.run(req.agent_name, model, req.question))
        return AgentQueryResponse(
            answer=result["answer"],
            tool_calls=_parse_tool_calls(result["tool_calls"]),
            verification=result["verification"],
            agent_name=req.agent_name,
        )

    if req.mode == "single":
        tools = global_registry.all(AGENT_TOOL)
        result = _run_guarded(lambda: run_agent_query(model, tools, req.question))
        return AgentQueryResponse(
            answer=result["answer"],
            tool_calls=_parse_tool_calls(result["tool_calls"]),
            verification=result["verification"],
        )

    result = _run_guarded(lambda: run_workforce_query(model, req.question))
    return AgentQueryResponse(
        answer=result["answer"],
        tool_calls=_parse_tool_calls(result["tool_calls"]),
        verification=result["verification"],
        role=result["role"],
    )


@router.get("/agents", response_model=list[AgentSpecResponse])
def list_agents() -> list[AgentSpecResponse]:
    return [AgentSpecResponse(**spec.model_dump()) for spec in builder.all()]


@router.post("/agents", response_model=AgentSpecResponse, status_code=201)
def create_agent(req: CreateAgentRequest) -> AgentSpecResponse:
    try:
        spec = builder.create(CustomAgentSpec(**req.model_dump()))
    except AgentAlreadyExistsError as exc:
        raise HTTPException(409, str(exc)) from exc
    except (UnknownToolError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    return AgentSpecResponse(**spec.model_dump())


@router.get("/agents/{name}", response_model=AgentSpecResponse)
def get_agent(name: str) -> AgentSpecResponse:
    try:
        spec = builder.get(name)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown agent: {name}") from exc
    return AgentSpecResponse(**spec.model_dump())


@router.put("/agents/{name}", response_model=AgentSpecResponse)
def update_agent(name: str, req: CreateAgentRequest) -> AgentSpecResponse:
    try:
        spec = builder.update(name, CustomAgentSpec(**req.model_dump()))
    except KeyError as exc:
        raise HTTPException(404, f"Unknown agent: {name}") from exc
    except (UnknownToolError, ValueError) as exc:
        raise HTTPException(400, str(exc)) from exc
    return AgentSpecResponse(**spec.model_dump())


@router.delete("/agents/{name}", status_code=204)
def delete_agent(name: str) -> None:
    try:
        builder.delete(name)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown agent: {name}") from exc
