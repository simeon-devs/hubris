from hubris.core.contracts import MetricResult, NetworkModel
from hubris.core.registry import METRIC, Registry, load_plugins, register_metric
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def test_load_plugins_does_not_error_on_empty_plugin_dirs():
    # Phase 0: hubris/plugins/{metrics,scenarios,optimizers} have no plugins
    # yet. Auto-discovery must be a no-op, not an error.
    load_plugins()


def test_dummy_plugin_self_registers_and_is_agent_usable():
    """Prove the keystone property: registering a plugin (via the decorator,
    the mechanism `load_plugins()` drives) makes it agent-usable through
    `as_agent_tools()` with zero changes to `registry.py` or to any agent —
    this test only ever touches the dummy class and the public decorator."""
    from hubris.core.registry import registry as global_registry

    @register_metric
    class DummySpareCapacity:
        name = "dummy_spare_capacity"
        unit = "parcels"

        def compute(self, model: NetworkModel, scenario_id: str | None) -> MetricResult:
            total_capacity = sum(h.capacity for h in model.hubs)
            total_demand = sum(model.demand.values())
            return MetricResult(
                name=self.name, value=total_capacity - total_demand, unit=self.unit
            )

    try:
        assert any(
            m.name == "dummy_spare_capacity" for m in global_registry.all(METRIC)
        )

        tools = global_registry.as_agent_tools()
        tool = next(t for t in tools if t.name == "metric_dummy_spare_capacity")

        model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)
        result = tool.run(model=model, scenario_id=None)

        # 100 + 100 capacity - (30 + 20 + 10) demand = 140, and it's COMPUTED
        # JSON from the tool, not a number the test made up independently of
        # the engine.
        assert result == {
            "name": "dummy_spare_capacity",
            "value": 140.0,
            "unit": "parcels",
            "breakdown": None,
        }
    finally:
        # Don't leak the dummy plugin into other tests' registry state.
        del global_registry._plugins[METRIC]["dummy_spare_capacity"]


def test_registry_get_and_all_are_isolated_per_instance():
    r = Registry()

    class DummyTool:
        name = "dummy_tool"

    r.register("agent_tool", DummyTool())

    assert r.all("agent_tool") == [r.get("agent_tool", "dummy_tool")]
    assert r.all("metric") == []
