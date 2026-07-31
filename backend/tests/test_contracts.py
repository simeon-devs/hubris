from hubris.core.contracts import (
    AgentTool,
    DataConnector,
    Metric,
    MetricResult,
    NetworkModel,
    OptimizerStrategy,
    Recommendation,
    ScenarioModule,
)
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def test_contracts_import_cleanly():
    assert issubclass(DataConnector, object)
    assert issubclass(Metric, object)
    assert issubclass(ScenarioModule, object)
    assert issubclass(OptimizerStrategy, object)
    assert issubclass(AgentTool, object)


def test_network_model_hydrates_from_tiny_fixture():
    model = NetworkModel.from_raw_tables(TINY_RAW_TABLES)

    assert [h.id for h in model.hubs] == ["H1", "H2"]
    assert [z.id for z in model.zones] == ["Z1", "Z2", "Z3"]
    assert model.demand == {"Z1": 30.0, "Z2": 20.0, "Z3": 10.0}

    assert model.od_matrix[("H1", "Z1")].cost == 10.0
    assert model.od_matrix[("H2", "Z3")].cost == 12.0

    # Z1 was split 20/10 across H1/H2 in current_assignments — dominant hub wins.
    assert model.assignments == {"Z1": "H1", "Z2": "H1", "Z3": "H2"}


def test_metric_result_and_recommendation_shapes():
    result = MetricResult(name="cost_to_serve", value=12.5, unit="AED/parcel")
    assert result.breakdown is None

    rec = Recommendation(
        changes=[{"action": "close_hub", "hub_id": "H2"}],
        objective_value=1000.0,
        delta_vs_baseline={"cost_to_serve_pct": -5.2},
        rationale={"binding_constraints": ["H1_capacity"]},
    )
    assert rec.changes[0]["hub_id"] == "H2"
