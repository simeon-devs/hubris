"""Agent Builder (BUILD_SPEC §5.2): a planner defines a new agent as a
name + plain-English goal + an allowed subset of registry tools + an
autonomy mode. It persists and works immediately — its tools already
compute, and it can never be given a tool outside the registry, so it
can't answer with a number that didn't come from one of them (same
runner, same no-fabrication guardrail as every other agent in this
system).
"""

from pydantic import BaseModel

from hubris.agents.runner import NO_FABRICATION_SYSTEM_PROMPT, run_agent_query
from hubris.core.contracts import AgentTool, NetworkModel
from hubris.core.registry import registry as global_registry

AUTONOMY_MODES = {"on-demand", "monitoring"}


class CustomAgentSpec(BaseModel):
    name: str
    goal: str
    allowed_tools: list[str]
    autonomy: str = "on-demand"


class UnknownToolError(ValueError):
    pass


class AgentAlreadyExistsError(ValueError):
    pass


class AgentBuilder:
    """In-memory registry of custom agents (Phase 2 scope). Swap for a
    DB-backed store later without changing this interface — `create/get/
    all/update/delete/tools_for/run` are the whole surface any caller
    (tests, or T-15's API routes) needs."""

    def __init__(self) -> None:
        self._agents: dict[str, CustomAgentSpec] = {}

    def _validate(self, spec: CustomAgentSpec) -> None:
        if spec.autonomy not in AUTONOMY_MODES:
            raise ValueError(f"Unknown autonomy mode: {spec.autonomy!r}")
        available = {tool.name for tool in global_registry.as_agent_tools()}
        unknown = set(spec.allowed_tools) - available
        if unknown:
            raise UnknownToolError(f"Unknown tool(s) for agent {spec.name!r}: {sorted(unknown)}")

    def create(self, spec: CustomAgentSpec) -> CustomAgentSpec:
        if spec.name in self._agents:
            raise AgentAlreadyExistsError(f"Agent already exists: {spec.name!r}")
        self._validate(spec)
        self._agents[spec.name] = spec
        return spec

    def update(self, name: str, spec: CustomAgentSpec) -> CustomAgentSpec:
        if name not in self._agents:
            raise KeyError(name)
        self._validate(spec)
        self._agents[name] = spec
        return spec

    def delete(self, name: str) -> None:
        del self._agents[name]  # raises KeyError if missing

    def get(self, name: str) -> CustomAgentSpec:
        return self._agents[name]

    def all(self) -> list[CustomAgentSpec]:
        return list(self._agents.values())

    def tools_for(self, name: str) -> list[AgentTool]:
        """The exact tool subset this agent is allowed to call — never
        more than `spec.allowed_tools`, regardless of what else is
        registered."""
        spec = self.get(name)
        return [t for t in global_registry.as_agent_tools() if t.name in spec.allowed_tools]

    def run(self, name: str, model: NetworkModel, question: str) -> dict:
        spec = self.get(name)
        system_prompt = f"{NO_FABRICATION_SYSTEM_PROMPT}\n\nYour specific goal: {spec.goal}"
        return run_agent_query(model, self.tools_for(name), question, system_prompt=system_prompt)


builder = AgentBuilder()

DEFAULT_TEMPLATES: list[CustomAgentSpec] = [
    CustomAgentSpec(
        name="capacity_watchdog",
        goal=(
            "Proactively flag hubs running low on spare capacity or close "
            "to over-utilized, so planners catch it before it becomes a problem."
        ),
        allowed_tools=["find_spare_capacity", "get_kpis"],
        autonomy="monitoring",
    ),
    CustomAgentSpec(
        name="cost_advisor",
        goal=(
            "Answer cost-to-serve questions and recommend cost-saving "
            "network changes, backed by the optimiser."
        ),
        allowed_tools=["get_kpis", "optimise_network"],
        autonomy="on-demand",
    ),
    CustomAgentSpec(
        name="whatif_explorer",
        goal="Run and compare what-if scenarios for planners exploring network changes.",
        allowed_tools=["simulate_scenario", "compare_scenarios", "get_kpis"],
        autonomy="on-demand",
    ),
]


def seed_default_templates() -> None:
    """Register the built-in templates. Call after `load_plugins()` so
    tool validation has real registered tools to check against."""
    for template in DEFAULT_TEMPLATES:
        if template.name not in builder._agents:
            builder.create(template)
