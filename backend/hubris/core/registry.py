"""Plugin registry + agent auto-discovery (CLAUDE.md §5).

Plugins self-register via the decorators below at import time. The agent
layer builds its toolset from `registry.as_agent_tools()` — so registering a
new metric/scenario/optimiser plugin makes it available to every agent with
no change to this module or to any agent.
"""

import importlib
import pkgutil
from typing import TypeVar

from hubris.core.contracts import (
    AgentTool,
    DataConnector,
    Metric,
    NetworkModel,
    OptimizerStrategy,
    ScenarioModule,
)

METRIC = "metric"
SCENARIO = "scenario"
OPTIMIZER = "optimizer"
DATA_CONNECTOR = "data_connector"
AGENT_TOOL = "agent_tool"

MetricT = TypeVar("MetricT", bound=Metric)
ScenarioT = TypeVar("ScenarioT", bound=ScenarioModule)
OptimizerT = TypeVar("OptimizerT", bound=OptimizerStrategy)
AgentToolT = TypeVar("AgentToolT", bound=AgentTool)
DataConnectorT = TypeVar("DataConnectorT", bound=DataConnector)


class Registry:
    def __init__(self) -> None:
        self._plugins: dict[str, dict[str, object]] = {}

    def register(self, kind: str, plugin: object) -> None:
        bucket = self._plugins.setdefault(kind, {})
        bucket[plugin.name] = plugin

    def get(self, kind: str, name: str) -> object:
        return self._plugins[kind][name]

    def all(self, kind: str) -> list:
        return list(self._plugins.get(kind, {}).values())

    def as_agent_tools(self) -> list[AgentTool]:
        """Every registered metric/scenario/optimiser, plus any tool
        registered directly, wrapped as `AgentTool`s an agent can call."""
        tools: list[AgentTool] = list(self.all(AGENT_TOOL))
        tools += [_MetricTool(metric) for metric in self.all(METRIC)]
        tools += [_ScenarioTool(scenario) for scenario in self.all(SCENARIO)]
        tools += [_OptimizerTool(optimizer) for optimizer in self.all(OPTIMIZER)]
        return tools


registry = Registry()


def register_metric(cls: type[MetricT]) -> type[MetricT]:
    registry.register(METRIC, cls())
    return cls


def register_scenario(cls: type[ScenarioT]) -> type[ScenarioT]:
    registry.register(SCENARIO, cls())
    return cls


def register_optimizer(cls: type[OptimizerT]) -> type[OptimizerT]:
    registry.register(OPTIMIZER, cls())
    return cls


def register_agent_tool(cls: type[AgentToolT]) -> type[AgentToolT]:
    registry.register(AGENT_TOOL, cls())
    return cls


def register_data_connector(cls: type[DataConnectorT]) -> type[DataConnectorT]:
    registry.register(DATA_CONNECTOR, cls())
    return cls


def load_plugins() -> None:
    """Import every module under `hubris.plugins.*` so self-registering
    decorators run. Dropping a new plugin file into one of those packages is
    enough to make it agent-usable — nothing here needs to change."""
    import hubris.plugins.metrics as metrics_pkg
    import hubris.plugins.optimizers as optimizers_pkg
    import hubris.plugins.scenarios as scenarios_pkg

    for pkg in (metrics_pkg, scenarios_pkg, optimizers_pkg):
        for _, module_name, _ in pkgutil.iter_modules(pkg.__path__, pkg.__name__ + "."):
            importlib.import_module(module_name)


class _MetricTool(AgentTool):
    def __init__(self, metric: Metric) -> None:
        self._metric = metric
        self.name = f"metric_{metric.name}"
        self.description = (
            f"Compute the '{metric.name}' metric ({metric.unit}) for a network "
            "model, optionally scoped to a scenario."
        )
        self.input_schema = {
            "type": "object",
            "properties": {"scenario_id": {"type": ["string", "null"]}},
        }

    def run(self, *, model: NetworkModel, scenario_id: str | None = None, **_: object) -> dict:
        return self._metric.compute(model, scenario_id).model_dump()


class _ScenarioTool(AgentTool):
    def __init__(self, scenario: ScenarioModule) -> None:
        self._scenario = scenario
        self.name = f"scenario_{scenario.name}"
        self.description = f"Apply the '{scenario.name}' what-if scenario to a network model."
        self.input_schema = scenario.params_schema

    def run(self, *, model: NetworkModel, params: dict, **_: object) -> dict:
        return self._scenario.apply(model, params).model_dump()


class _OptimizerTool(AgentTool):
    def __init__(self, optimizer: OptimizerStrategy) -> None:
        self._optimizer = optimizer
        self.name = f"optimize_{optimizer.name}"
        self.description = f"Run the '{optimizer.name}' optimiser to recommend network changes."
        self.input_schema = {
            "type": "object",
            "properties": {
                "objective": {"type": "object"},
                "constraints": {"type": "array"},
            },
        }

    def run(
        self, *, model: NetworkModel, objective: dict, constraints: list[dict], **_: object
    ) -> dict:
        return self._optimizer.optimize(model, objective, constraints).model_dump()
