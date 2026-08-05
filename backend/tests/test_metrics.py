"""Hand-checkable tests for the Cost/KPI calculator metrics (T-07), using the
tiny 2-hub/3-zone fixture. Expected assignment (from T-02's dominant-hub
resolution): Z1->H1 (20 beat 10), Z2->H1, Z3->H2.

Hand math:
  transport = 30*10 (Z1 via H1) + 20*14 (Z2 via H1) + 10*12 (Z3 via H2)
            = 300 + 280 + 120 = 700
  fixed     = 1000 (H1) + 900 (H2) = 1900
  total     = 2600 over 60 total demand -> cost_to_serve = 43.3333 AED/parcel

  H1 assigned = 30+20 = 50 / 100 capacity = 50% utilization, 50 spare
  H2 assigned = 10 / 100 capacity = 10% utilization, 90 spare
  network utilization = 60 assigned / 200 capacity = 30%

  All 3 assigned edges have time_min well under each zone's 24h SLA ->
  100% coverage.
"""

from hubris.core.contracts import NetworkModel
from hubris.plugins.metrics.coverage import CoverageMetric
from hubris.plugins.metrics.cost_to_serve import CostToServeMetric
from hubris.plugins.metrics.spare_capacity import SpareCapacityMetric
from hubris.plugins.metrics.utilization import UtilizationMetric
from tests.fixtures.tiny_network import TINY_RAW_TABLES


def _model() -> NetworkModel:
    return NetworkModel.from_raw_tables(TINY_RAW_TABLES)


def test_cost_to_serve():
    result = CostToServeMetric().compute(_model(), None)
    assert result.name == "cost_to_serve"
    assert result.unit == "AED/parcel"
    assert result.value == round(2600 / 60, 4)
    assert result.breakdown["transport_cost"] == 700.0
    assert result.breakdown["fixed_cost"] == 1900.0
    assert result.breakdown["total_cost"] == 2600.0
    assert result.breakdown["per_emirate_transport_cost"] == {"Dubai": 580.0, "Abu Dhabi": 120.0}


def test_utilization():
    result = UtilizationMetric().compute(_model(), None)
    assert result.value == 30.0
    assert result.breakdown == {"H1": 50.0, "H2": 10.0}


def test_spare_capacity():
    result = SpareCapacityMetric().compute(_model(), None)
    assert result.value == 140.0
    assert result.breakdown == {"H1": 50.0, "H2": 90.0}


def test_coverage():
    result = CoverageMetric().compute(_model(), None)
    assert result.value == 100.0
    assert result.breakdown == {"Dubai": 100.0, "Abu Dhabi": 100.0}


def test_demand_served_full_when_capacity_suffices():
    from hubris.plugins.metrics.demand_served import DemandServedMetric

    result = DemandServedMetric().compute(_model(), None)
    assert result.value == 100.0
    assert result.breakdown["served"] == 60.0
    assert result.breakdown["unmet_total"] == 0.0
    assert result.breakdown["unmet_by_zone"] == {}
    # per-emirate served mirrors coverage's shape
    assert result.breakdown["Dubai"] == 100.0 and result.breakdown["Abu Dhabi"] == 100.0


def test_demand_served_reports_the_capacity_shortfall_coverage_cannot_see():
    # Same tiny network, capacities squeezed to 25+25=50 vs 60 demand:
    # coverage stays 100% (every zone still within SLA REACH of its hub)
    # while served drops to 50/60 = 83.33% — the two named quantities.
    from hubris.plugins.metrics.demand_served import DemandServedMetric

    starved = TINY_RAW_TABLES.model_copy(deep=True)
    for hub in starved.hubs:
        hub["capacity"] = 25.0
    model = NetworkModel.from_raw_tables(starved)

    assert CoverageMetric().compute(model, None).value == 100.0  # reachability
    served = DemandServedMetric().compute(model, None)
    assert served.value == 83.33
    assert served.breakdown["unmet_total"] == 10.0
    assert sum(served.breakdown["unmet_by_zone"].values()) == 10.0


def test_metrics_are_registered_and_agent_usable():
    from hubris.core.registry import METRIC, load_plugins
    from hubris.core.registry import registry as global_registry

    load_plugins()
    registered_names = {m.name for m in global_registry.all(METRIC)}
    assert {
        "cost_to_serve", "utilization", "coverage", "spare_capacity", "demand_served",
        "demand_by_emirate", "courier_utilization",
    } <= registered_names

    tools = global_registry.as_agent_tools()
    tool = next(t for t in tools if t.name == "metric_cost_to_serve")
    result = tool.run(model=_model(), scenario_id=None)
    assert result["value"] == round(2600 / 60, 4)
