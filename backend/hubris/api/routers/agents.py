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


@router.post("/agent/query", response_model=AgentQueryResponse)
def agent_query(req: AgentQueryRequest) -> AgentQueryResponse:
    try:
        model = state.get_model(req.scenario_id)
    except KeyError as exc:
        raise HTTPException(404, f"Unknown scenario_id: {req.scenario_id}") from exc

    if req.agent_name:
        try:
            result = builder.run(req.agent_name, model, req.question)
        except KeyError as exc:
            raise HTTPException(404, f"Unknown agent: {req.agent_name}") from exc
        return AgentQueryResponse(
            answer=result["answer"],
            tool_calls=_parse_tool_calls(result["tool_calls"]),
            agent_name=req.agent_name,
            verification=result.get("verification"),
        )

    if req.mode == "single":
        tools = global_registry.all(AGENT_TOOL)
        result = run_agent_query(model, tools, req.question)
        return AgentQueryResponse(
            answer=result["answer"],
            tool_calls=_parse_tool_calls(result["tool_calls"]),
            verification=result.get("verification"),
        )

    result = run_workforce_query(model, req.question)
    return AgentQueryResponse(
        answer=result["answer"],
        tool_calls=_parse_tool_calls(result["tool_calls"]),
        role=result["role"],
        verification=result.get("verification"),
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
